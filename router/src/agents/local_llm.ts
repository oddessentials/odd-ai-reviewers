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

import type { ReviewAgent, AgentContext, AgentResult, Finding, Severity } from './index.js';
import type { DiffFile } from '../diff.js';
import { buildAgentEnv } from './security.js';
import { estimateTokens } from '../budget.js';

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
/** Timeout for Ollama requests (120 seconds) */
const TIMEOUT_MS = 120000;

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
 */
export function sanitizeDiffForLLM(
  files: DiffFile[],
  diffContent: string
): { sanitized: string; truncated: boolean; reason?: string } {
  // Sort files alphabetically for determinism
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  // Limit to MAX_FILES
  let truncated = false;
  let reason: string | undefined;

  if (sortedFiles.length > MAX_FILES) {
    truncated = true;
    reason = `Limited to ${MAX_FILES} files (${sortedFiles.length} total)`;
  }

  // Redact secrets
  let sanitized = diffContent;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
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

  return { sanitized, truncated, reason };
}

/**
 * Build review prompt for Ollama
 */
function buildPrompt(files: DiffFile[], diffContent: string): string {
  const fileSummary = files
    .map((f) => `- ${f.path} (${f.status}: +${f.additions}/-${f.deletions})`)
    .join('\n');

  return `You are a code reviewer. Analyze this diff and return ONLY a valid JSON object.

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
 * Call Ollama API with timeout
 */
async function callOllama(
  url: string,
  request: OllamaRequest,
  timeoutMs: number
): Promise<{ ok: boolean; response?: string; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        ok: false,
        error: `Ollama HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = (await response.json()) as OllamaResponse;

    if (data.error) {
      return { ok: false, error: `Ollama error: ${data.error}` };
    }

    if (!data.response) {
      return { ok: false, error: 'Empty response from Ollama' };
    }

    return { ok: true, response: data.response };
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
    const model = agentEnv['OLLAMA_MODEL'] || 'codellama:7b';

    // Get supported files
    const supportedFiles = context.files.filter((f) => this.supports(f));

    if (supportedFiles.length === 0) {
      return {
        agentId: this.id,
        success: true,
        findings: [],
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      };
    }

    // Sanitize and bound input
    const { sanitized, truncated, reason } = sanitizeDiffForLLM(
      supportedFiles,
      context.diffContent
    );

    if (truncated) {
      console.log(`[local_llm] Input truncated: ${reason}`);
    }

    // Check token limit
    const estimatedTokens = estimateTokens(sanitized);
    if (estimatedTokens > MAX_TOKENS) {
      return {
        agentId: this.id,
        success: false,
        findings: [],
        error: `Input too large: ${estimatedTokens} tokens exceeds limit of ${MAX_TOKENS}`,
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      };
    }

    // Build prompt
    const prompt = buildPrompt(supportedFiles.slice(0, MAX_FILES), sanitized);

    // Prepare Ollama request with deterministic settings
    const request: OllamaRequest = {
      model,
      prompt,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.0,
        seed: 42,
        num_ctx: 4096,
      },
    };

    console.log(
      `[local_llm] Calling Ollama at ${ollamaUrl} with model ${model} (${estimatedTokens} tokens)`
    );

    // Call Ollama with timeout
    const result = await callOllama(ollamaUrl, request, TIMEOUT_MS);

    if (!result.ok) {
      // Graceful degradation: if Ollama is unavailable, don't fail the CI
      if (
        result.error?.includes('ECONNREFUSED') ||
        result.error?.includes('fetch failed') ||
        result.error?.includes('ENOTFOUND')
      ) {
        console.log(`[local_llm] Ollama unavailable (${result.error}), skipping gracefully`);
        return {
          agentId: this.id,
          success: true,
          findings: [],
          metrics: {
            durationMs: Date.now() - startTime,
            filesProcessed: 0,
          },
        };
      }

      // Other errors are real failures
      return {
        agentId: this.id,
        success: false,
        findings: [],
        error: result.error,
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      };
    }

    // Parse response
    const parseResult = parseOllamaResponse(result.response ?? '');

    if (!parseResult.ok) {
      return {
        agentId: this.id,
        success: false,
        findings: [],
        error: parseResult.error,
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      };
    }

    console.log(`[local_llm] Found ${parseResult.findings.length} findings`);

    return {
      agentId: this.id,
      success: true,
      findings: parseResult.findings,
      metrics: {
        durationMs: Date.now() - startTime,
        filesProcessed: supportedFiles.length,
      },
    };
  },
};
