/**
 * Local LLM Agent (Ollama)
 * Uses Ollama for local, air-gapped AI code review
 *
 * INVARIANTS ENFORCED:
 * - Router Monopoly Rule: No GitHub tokens passed to Ollama
 * - Input Bounding: Max 50 files, 2000 lines, 8192 tokens
 * - Strict JSON: Fail fast on invalid responses
 * - Deterministic: temperature=0, seed=42, alphabetical file ordering
 */

import type { ReviewAgent, AgentContext, AgentResult, Finding, Severity } from './types.js';
import { AgentSuccess, AgentFailure, AgentSkipped } from './types.js';
import type { DiffFile } from '../diff.js';
import { buildAgentEnv } from './security.js';
import { estimateTokens } from '../budget.js';
import { getCurrentDateUTC } from './date-utils.js';

const SUPPORTED_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.go',
  '.java',
  '.rb',
  '.php',
  '.c',
  '.cpp',
  '.cs',
  '.rs',
  '.swift',
  '.kt',
  '.scala',
  '.vue',
  '.svelte',
];

/** Max files to process (truncate if exceeded) */
const MAX_FILES = 50;
/** Max diff lines to send (truncate with marker if exceeded) */
const MAX_DIFF_LINES = 2000;
/** Max tokens allowed (abort if exceeded) */
const MAX_TOKENS = 8192;
/** Max findings to return (cap output for determinism) */
const MAX_FINDINGS = 200;
/** Default timeout for Ollama requests (10 minutes - allows for slow inference) */
const DEFAULT_TIMEOUT_MS = 600000;
/** Default context window size (8k tokens - balances capability vs VRAM usage) */
const DEFAULT_NUM_CTX = 8192;
/** Default max output tokens (circuit breaker, not truncation) */
const DEFAULT_NUM_PREDICT = 8192;
/** Default Ollama model */
const DEFAULT_MODEL = 'codellama:7b';

/** Secret patterns to redact from diff content */
const SECRET_PATTERNS = [
  /ghp_[a-zA-Z0-9]{36}/g, // GitHub PAT
  /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth
  /ghs_[a-zA-Z0-9]{36}/g, // GitHub Server
  /github_pat_[a-zA-Z0-9_]{82}/g, // Fine-grained PAT
  /GITHUB_TOKEN=["']?[^"'\s]+["']?/gi,
  /GH_TOKEN=["']?[^"'\s]+["']?/gi,
  /Authorization:\s*Bearer\s+[^\s]+/gi,
];

/**
 * Ollama API request structure
 */
interface OllamaRequest {
  model: string;
  prompt: string;
  stream: boolean;
  format: string;
  options: {
    temperature: number;
    seed: number;
    num_ctx: number;
    num_predict: number;
  };
}

/**
 * Ollama API response structure
 */
interface OllamaResponse {
  response?: string;
  done?: boolean;
  error?: string;
}

/**
 * Expected JSON structure from LLM
 */
interface LlmReviewResponse {
  findings?: LlmFinding[];
  summary?: string;
}

interface LlmFinding {
  severity?: string;
  file?: string;
  line?: number;
  message?: string;
  suggestion?: string;
  category?: string;
}

/**
 * Sanitize diff content by removing secrets and applying bounding limits
 * Returns sorted files for deterministic ordering
 */
export function sanitizeDiffForLLM(
  files: DiffFile[],
  diffContent: string
): { sanitized: string; truncated: boolean; reason?: string; sortedFiles: DiffFile[] } {
  // Sort files alphabetically for determinism
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  // Limit to MAX_FILES and truncate diff content accordingly
  let truncated = false;
  let reason: string | undefined;
  const limitedFiles = sortedFiles.slice(0, MAX_FILES);

  if (sortedFiles.length > MAX_FILES) {
    truncated = true;
    reason = `Limited to ${MAX_FILES} files (${sortedFiles.length} total)`;
  }

  // Redact secrets
  let sanitized = diffContent;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // If files were truncated, filter diff content to only include limited files
  if (truncated) {
    const limitedPaths = new Set(limitedFiles.map((f) => f.path));
    const diffLines = sanitized.split('\n');
    const filteredLines: string[] = [];
    let currentFile: string | null = null;
    let includeCurrentFile = false;

    for (const line of diffLines) {
      // Detect file headers (e.g., "diff --git a/path b/path" or "+++ b/path")
      const diffHeader = line.match(/^(?:diff --git a\/(.+) b\/|\+\+\+ b\/)(.+)$/);
      if (diffHeader) {
        currentFile = (diffHeader[2] || diffHeader[1]) ?? null;
        includeCurrentFile = currentFile ? limitedPaths.has(currentFile) : false;
      }

      if (includeCurrentFile || currentFile === null) {
        filteredLines.push(line);
      }
    }

    sanitized = filteredLines.join('\n');
    sanitized += `\n\n[... ${sortedFiles.length - MAX_FILES} files omitted ...]`;
  }

  // Limit to MAX_DIFF_LINES
  const lines = sanitized.split('\n');
  if (lines.length > MAX_DIFF_LINES) {
    sanitized = lines.slice(0, MAX_DIFF_LINES).join('\n');
    sanitized += `\n\n[... truncated ${lines.length - MAX_DIFF_LINES} lines ...]`;
    truncated = true;
    reason = reason
      ? `${reason}; Limited to ${MAX_DIFF_LINES} lines`
      : `Limited to ${MAX_DIFF_LINES} lines`;
  }

  return { sanitized, truncated, reason, sortedFiles: limitedFiles };
}

/**
 * Build review prompt for Ollama
 * Files must be pre-sorted for determinism
 */
function buildPrompt(files: DiffFile[], diffContent: string): string {
  const currentDate = getCurrentDateUTC();

  // Files are already sorted by sanitizeDiffForLLM
  const fileSummary = files
    .map((f) => `- ${f.path} (${f.status}: +${f.additions}/-${f.deletions})`)
    .join('\n');

  return `You are a code reviewer. Analyze this diff and return ONLY a valid JSON object.

Current date (UTC): ${currentDate}

## Files Changed
${fileSummary}

## Diff
\`\`\`diff
${diffContent}
\`\`\`

Return a JSON object with this exact structure (no extra text):
{
  "findings": [
    {
      "severity": "error|warning|info",
      "file": "path/to/file.ts",
      "line": 42,
      "message": "Description of issue",
      "suggestion": "How to fix (optional)",
      "category": "security|performance|logic|style"
    }
  ],
  "summary": "Brief review summary"
}

Focus on: security vulnerabilities, logic errors, performance issues, and code quality.`;
}

/**
 * Parse Ollama response into structured findings
 */
function parseOllamaResponse(response: string): {
  ok: boolean;
  findings: Finding[];
  error?: string;
} {
  const trimmed = response.trim();

  if (!trimmed) {
    return { ok: false, findings: [], error: 'Empty response from Ollama' };
  }

  // Find JSON boundaries
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return { ok: false, findings: [], error: 'No valid JSON in Ollama response' };
  }

  // Reject mixed stdout
  const beforeJson = trimmed.slice(0, jsonStart).trim();
  const afterJson = trimmed.slice(jsonEnd + 1).trim();

  if (beforeJson || afterJson) {
    return {
      ok: false,
      findings: [],
      error: 'Mixed stdout detected: response contains non-JSON content',
    };
  }

  const jsonStr = trimmed.slice(jsonStart, jsonEnd + 1);

  let parsed: LlmReviewResponse;
  try {
    parsed = JSON.parse(jsonStr) as LlmReviewResponse;
  } catch (e) {
    return {
      ok: false,
      findings: [],
      error: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`,
    };
  }

  // Convert to Finding format
  const findings: Finding[] = [];
  for (const raw of parsed.findings ?? []) {
    if (!raw.file || !raw.message) {
      console.warn('[local_llm] Skipping finding with missing required fields:', raw);
      continue;
    }

    findings.push({
      severity: mapSeverity(raw.severity),
      file: raw.file,
      line: raw.line,
      message: raw.message,
      suggestion: raw.suggestion,
      ruleId: raw.category ? `local-llm/${raw.category}` : 'local-llm/review',
      sourceAgent: 'local_llm',
    });
  }

  return { ok: true, findings };
}

/**
 * Map LLM severity to standard severity
 */
function mapSeverity(severity?: string): Severity {
  switch (severity?.toLowerCase()) {
    case 'error':
    case 'critical':
    case 'high':
      return 'error';
    case 'warning':
    case 'medium':
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * Severity ordering for deterministic sorting (error > warning > info)
 */
const SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/**
 * Bound and dedupe findings for deterministic output
 */
function boundFindings(findings: Finding[]): {
  bounded: Finding[];
  total: number;
  included: number;
} {
  // Sort by severity (error first), then by file, then by line, then by ruleId for stability
  const sorted = [...findings].sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    const fileDiff = a.file.localeCompare(b.file);
    if (fileDiff !== 0) return fileDiff;
    const lineDiff = (a.line ?? 0) - (b.line ?? 0);
    if (lineDiff !== 0) return lineDiff;
    return (a.ruleId ?? '').localeCompare(b.ruleId ?? '');
  });

  // Dedupe by file+line+message
  const seen = new Set<string>();
  const deduped = sorted.filter((f) => {
    const key = `${f.file}:${f.line}:${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Cap at MAX_FINDINGS
  const bounded = deduped.slice(0, MAX_FINDINGS);
  return { bounded, total: findings.length, included: bounded.length };
}

/**
 * Warm up model to ensure consistent first-run behavior
 */
async function warmUpModel(
  ollamaUrl: string,
  model: string
): Promise<{ ok: boolean; error?: string }> {
  const warmupRequest: OllamaRequest = {
    model,
    prompt: 'ping',
    stream: false,
    format: 'json',
    options: {
      temperature: 0,
      seed: 42,
      num_ctx: 512,
      num_predict: 10,
    },
  };

  try {
    const result = await callOllama(ollamaUrl, warmupRequest, 30000);
    if (result.ok) {
      console.log('[local_llm] Model warmed up successfully');
    }
    return result;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'warmup failed' };
  }
}

/**
 * Attempt single JSON repair pass when initial parse fails
 */
async function attemptJsonRepair(
  rawResponse: string,
  ollamaUrl: string,
  model: string,
  numCtx: number,
  timeoutMs: number
): Promise<{ ok: boolean; findings: Finding[]; error?: string }> {
  console.log('[local_llm] Initial JSON parse failed, attempting repair pass');

  const repairPrompt = `The following text should be a JSON object but has errors.
Extract or fix ONLY the JSON object matching this exact schema:
{"findings": [{"severity": "error|warning|info", "file": "path", "line": number, "message": "text"}], "summary": "text"}

Original text (may be truncated):
${rawResponse.slice(0, 2000)}

Return ONLY valid JSON, no explanation or other text.`;

  const repairRequest: OllamaRequest = {
    model,
    prompt: repairPrompt,
    stream: false,
    format: 'json',
    options: {
      temperature: 0,
      seed: 42,
      num_ctx: numCtx,
      num_predict: DEFAULT_NUM_PREDICT,
    },
  };

  // Use half the remaining timeout for repair
  const repairResult = await callOllama(ollamaUrl, repairRequest, Math.min(timeoutMs / 2, 120000));

  if (!repairResult.ok) {
    return {
      ok: false,
      findings: [],
      error: `JSON repair failed: ${repairResult.error}`,
    };
  }

  // Try parsing repair result
  const parseResult = parseOllamaResponse(repairResult.response ?? '');

  if (!parseResult.ok) {
    return {
      ok: false,
      findings: [],
      error: `JSON parsing failed after repair attempt: ${parseResult.error}`,
    };
  }

  console.log('[local_llm] JSON repair successful');
  return parseResult;
}

/**
 * Call Ollama API with streaming to prevent server-side timeouts.
 * Ollama has an internal ~2 minute timeout for non-streaming requests.
 * Streaming keeps the connection alive during generation.
 */
async function callOllama(
  url: string,
  request: OllamaRequest,
  timeoutMs: number
): Promise<{ ok: boolean; response?: string; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Force streaming mode to prevent Ollama server-side timeout
  const streamingRequest = { ...request, stream: true };

  try {
    const response = await fetch(`${url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(streamingRequest),
      signal: controller.signal,
    });

    if (!response.ok) {
      clearTimeout(timeout);
      return {
        ok: false,
        error: `Ollama HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Read streaming response and accumulate chunks
    const reader = response.body?.getReader();
    if (!reader) {
      clearTimeout(timeout);
      return { ok: false, error: 'No response body from Ollama' };
    }

    const decoder = new TextDecoder();
    let fullResponse = '';
    let lastError: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // Each chunk is a JSON line
      const lines = chunk.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as OllamaResponse;
          if (parsed.error) {
            lastError = parsed.error;
          }
          if (parsed.response) {
            fullResponse += parsed.response;
          }
        } catch {
          // Ignore JSON parse errors on partial chunks
        }
      }
    }

    clearTimeout(timeout);

    if (lastError) {
      return { ok: false, error: `Ollama error: ${lastError}` };
    }

    if (!fullResponse) {
      return { ok: false, error: 'Empty response from Ollama' };
    }

    return { ok: true, response: fullResponse };
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { ok: false, error: `Timeout after ${timeoutMs}ms` };
      }
      // Connection refused, network error, etc.
      return { ok: false, error: error.message };
    }

    return { ok: false, error: 'Unknown error calling Ollama' };
  }
}

export const localLlmAgent: ReviewAgent = {
  id: 'local_llm',
  name: 'Local LLM (Ollama)',
  usesLlm: true,

  supports(file: DiffFile): boolean {
    if (file.status === 'deleted') return false;
    return SUPPORTED_EXTENSIONS.some((ext) => file.path.endsWith(ext));
  },

  async run(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();

    const agentEnv = buildAgentEnv('local_llm', context.env);
    const ollamaUrl = agentEnv['OLLAMA_BASE_URL'] || 'http://ollama-sidecar:11434';
    const model = agentEnv['OLLAMA_MODEL'] || DEFAULT_MODEL;
    const numCtx = parseInt(agentEnv['LOCAL_LLM_NUM_CTX'] || String(DEFAULT_NUM_CTX), 10);
    const numPredict = parseInt(
      agentEnv['LOCAL_LLM_NUM_PREDICT'] || String(DEFAULT_NUM_PREDICT),
      10
    );
    const timeoutMs = parseInt(agentEnv['LOCAL_LLM_TIMEOUT'] || String(DEFAULT_TIMEOUT_MS), 10);

    // Log runtime configuration for reproducibility (requirement 4)
    console.log('[local_llm] Configuration:', {
      model,
      ollamaUrl,
      numCtx,
      numPredict,
      timeoutMs,
      streaming: true,
      filesCount: context.files.length,
    });

    // Get supported files
    const supportedFiles = context.files.filter((f) => this.supports(f));

    if (supportedFiles.length === 0) {
      return AgentSkipped({
        agentId: 'local_llm',
        reason: 'No supported files to process',
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      });
    }

    // Warm up model for consistent first-run behavior (requirement 7)
    const warmupResult = await warmUpModel(ollamaUrl, model);
    if (!warmupResult.ok) {
      // Check if this is a connection failure
      const isConnectionFailure =
        warmupResult.error?.includes('ECONNREFUSED') ||
        warmupResult.error?.includes('fetch failed') ||
        warmupResult.error?.includes('ENOTFOUND');

      if (isConnectionFailure) {
        const optionalMode = agentEnv['LOCAL_LLM_OPTIONAL'] === 'true';
        if (optionalMode) {
          console.log(
            `[local_llm] Ollama unavailable at ${ollamaUrl}, skipping gracefully (LOCAL_LLM_OPTIONAL=true)`
          );
          return AgentSkipped({
            agentId: 'local_llm',
            reason: `Ollama unavailable at ${ollamaUrl} (LOCAL_LLM_OPTIONAL=true)`,
            metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
          });
        } else {
          console.error(
            `[local_llm] Cannot connect to Ollama at ${ollamaUrl}. ` +
              `Verify: (1) Ollama container is running, (2) OLLAMA_BASE_URL is set correctly.`
          );
          return AgentFailure({
            agentId: 'local_llm',
            error: `Ollama unavailable: ${warmupResult.error}`,
            failureStage: 'preflight',
            metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
          });
        }
      }
      // Non-connection warmup failures are warnings, continue anyway
      console.warn(`[local_llm] Warmup failed (continuing): ${warmupResult.error}`);
    }

    // Sanitize and bound input
    const { sanitized, truncated, reason, sortedFiles } = sanitizeDiffForLLM(
      supportedFiles,
      context.diffContent
    );

    if (truncated) {
      console.log(`[local_llm] Input truncated: ${reason}`);
    }

    // Build prompt with sorted files for deterministic ordering
    const prompt = buildPrompt(sortedFiles, sanitized);

    // Estimate tokens on COMPLETE prompt (not just diff body)
    const estimatedTokens = estimateTokens(prompt);
    if (estimatedTokens > MAX_TOKENS) {
      return AgentFailure({
        agentId: 'local_llm',
        error: `Input too large: ${estimatedTokens} tokens exceeds limit of ${MAX_TOKENS}`,
        failureStage: 'preflight',
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      });
    }

    // Build Ollama request
    const request: OllamaRequest = {
      model,
      prompt,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.0,
        seed: 42,
        num_ctx: numCtx,
        num_predict: numPredict,
      },
    };

    console.log(
      `[local_llm] Calling Ollama (${estimatedTokens} tokens, ctx=${numCtx}, num_predict=${numPredict}, timeout=${timeoutMs}ms)`
    );

    // Call Ollama with timeout
    const result = await callOllama(ollamaUrl, request, timeoutMs);

    if (!result.ok) {
      // Other errors are real failures (connection failures handled in warmup)
      return AgentFailure({
        agentId: 'local_llm',
        error: result.error ?? 'Unknown Ollama error',
        failureStage: 'exec',
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      });
    }

    // Parse response
    let parseResult = parseOllamaResponse(result.response ?? '');

    // If parsing failed, attempt single JSON repair pass (requirement 3)
    if (!parseResult.ok && result.response) {
      const remainingTime = timeoutMs - (Date.now() - startTime);
      if (remainingTime > 30000) {
        // Only attempt repair if we have at least 30s left
        parseResult = await attemptJsonRepair(
          result.response,
          ollamaUrl,
          model,
          numCtx,
          remainingTime
        );
      }
    }

    if (!parseResult.ok) {
      return AgentFailure({
        agentId: 'local_llm',
        error: parseResult.error ?? 'Unknown parse error',
        failureStage: 'postprocess',
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      });
    }

    // Bound and dedupe findings for deterministic output (requirement 6)
    const { bounded: boundedFindings, total, included } = boundFindings(parseResult.findings);

    if (total !== included) {
      console.log(
        `[local_llm] Findings bounded: total=${total} included=${included} (dropped=${total - included})`
      );
    }

    console.log(`[local_llm] Found ${included} findings`);

    return AgentSuccess({
      agentId: 'local_llm',
      findings: boundedFindings,
      metrics: {
        durationMs: Date.now() - startTime,
        filesProcessed: supportedFiles.length,
      },
    });
  },
};
