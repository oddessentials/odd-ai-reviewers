/**
 * OpenCode Agent
 * Spawns OpenCode CLI for AI-powered code review
 *
 * INVARIANTS ENFORCED:
 * - Router owns posting: OpenCode runs without GitHub tokens, returns structured findings only
 * - Agents return structured findings: Output must be valid JSON conforming to schema
 * - No network listeners: HTTP server is disabled, guard validates no open ports
 *
 * CVE-2026-22812 Mitigation:
 * - OpenCode HTTP server is hard-disabled via environment
 * - Runtime guard detects any listening sockets and fails the job
 */

import { spawn, execSync } from 'child_process';
import type { ReviewAgent, AgentContext, AgentResult, Finding, Severity } from './index.js';
import type { DiffFile } from '../diff.js';
import { buildAgentEnv, validateNoListeningSockets } from './security.js';

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

/** Timeout for OpenCode execution (5 minutes) */
const EXECUTION_TIMEOUT_MS = 300000;

/** Expected JSON schema for OpenCode output */
interface OpencodeJsonOutput {
  findings?: OpencodeRawFinding[];
  summary?: string;
  error?: string;
}

interface OpencodeRawFinding {
  severity?: string;
  file?: string;
  line?: number;
  end_line?: number;
  message?: string;
  suggestion?: string;
  rule_id?: string;
}

interface OpencodeResult {
  ok: boolean;
  findings: Finding[];
  error?: string;
  exitCode: number;
}

/**
 * Check if opencode CLI is available (not that it's ready with tokens - we strip those)
 */
function isOpencodeInstalled(): { installed: boolean; error?: string } {
  try {
    execSync('opencode --version', { stdio: 'ignore', timeout: 5000 });
    return { installed: true };
  } catch {
    return { installed: false, error: 'opencode CLI not installed' };
  }
}

/**
 * Build review prompt requesting structured JSON output
 */
function buildReviewPrompt(context: AgentContext): string {
  const files = context.files
    .filter((f) => f.status !== 'deleted')
    .map((f) => `- ${f.path} (+${f.additions}/-${f.deletions})`)
    .join('\n');

  return `Review this code diff and return ONLY a valid JSON object with the following structure:
{
  "findings": [
    {
      "severity": "error|warning|info",
      "file": "path/to/file.ts",
      "line": 42,
      "end_line": 45,
      "message": "Description of the issue",
      "suggestion": "How to fix it (optional)",
      "rule_id": "category/rule-name"
    }
  ],
  "summary": "Brief overall assessment"
}

Do NOT include any text before or after the JSON object. Output ONLY the JSON.

## Files Changed
${files}

## Diff
\`\`\`diff
${context.diffContent}
\`\`\`

Analyze for:
- Security vulnerabilities
- Logic errors and bugs
- Performance issues
- Code quality problems
- Best practice violations`;
}

/**
 * Parse OpenCode stdout into structured findings
 * Enforces strict JSON envelope as required by CONSOLIDATED.md
 */
function parseOpencodeOutput(stdout: string): {
  ok: boolean;
  findings: Finding[];
  error?: string;
} {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return { ok: false, findings: [], error: 'Empty output from opencode' };
  }

  // Find JSON object boundaries
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return { ok: false, findings: [], error: 'No valid JSON object in opencode output' };
  }

  // Reject if there's non-whitespace content before or after JSON (mixed stdout)
  const beforeJson = trimmed.slice(0, jsonStart).trim();
  const afterJson = trimmed.slice(jsonEnd + 1).trim();

  if (beforeJson || afterJson) {
    return {
      ok: false,
      findings: [],
      error: 'Mixed stdout detected: opencode output contains non-JSON content',
    };
  }

  const jsonStr = trimmed.slice(jsonStart, jsonEnd + 1);

  let parsed: OpencodeJsonOutput;
  try {
    parsed = JSON.parse(jsonStr) as OpencodeJsonOutput;
  } catch (e) {
    return {
      ok: false,
      findings: [],
      error: `Invalid JSON from opencode: ${e instanceof Error ? e.message : 'parse error'}`,
    };
  }

  // Handle error response from OpenCode
  if (parsed.error) {
    return { ok: false, findings: [], error: `OpenCode error: ${parsed.error}` };
  }

  // Convert to our Finding format
  const findings: Finding[] = [];
  for (const raw of parsed.findings ?? []) {
    // Validate required fields
    if (!raw.file || !raw.message) {
      console.warn('[opencode] Skipping finding with missing required fields:', raw);
      continue;
    }

    findings.push({
      severity: mapSeverity(raw.severity),
      file: raw.file,
      line: raw.line,
      endLine: raw.end_line,
      message: raw.message,
      suggestion: raw.suggestion,
      ruleId: raw.rule_id ?? 'opencode/review',
      sourceAgent: 'opencode',
    });
  }

  return { ok: true, findings };
}

/**
 * Map OpenCode severity to our standard severity
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
 * Run opencode CLI as untrusted subprocess
 * SECURITY: Tokens are stripped, HTTP server is disabled
 */
async function runOpencode(context: AgentContext, prompt: string): Promise<OpencodeResult> {
  // Strip ALL tokens from environment (Router Monopoly Rule)
  const cleanEnv = buildAgentEnv('opencode', context.env);

  // Add OpenCode-specific config to disable HTTP server (CVE mitigation)
  const safeEnv: Record<string, string> = {
    ...cleanEnv,
    // Hard-disable HTTP server mode
    OPENCODE_HTTP_DISABLED: 'true',
    OPENCODE_NO_SERVER: 'true',
    OPENCODE_HEADLESS: 'true',
    // Set model if provided (without tokens)
    MODEL: cleanEnv['OPENCODE_MODEL'] ?? cleanEnv['MODEL'] ?? 'openai/gpt-4o-mini',
    // LLM API keys are allowed (not GitHub tokens)
    ...(cleanEnv['OPENAI_API_KEY'] ? { OPENAI_API_KEY: cleanEnv['OPENAI_API_KEY'] } : {}),
    ...(cleanEnv['ANTHROPIC_API_KEY'] ? { ANTHROPIC_API_KEY: cleanEnv['ANTHROPIC_API_KEY'] } : {}),
  };

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Run in non-interactive, JSON output mode
    const proc = spawn('opencode', ['--json', '--non-interactive'], {
      env: safeEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: context.repoPath,
    });

    // Set timeout
    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, EXECUTION_TIMEOUT_MS);

    // Write prompt to stdin
    if (proc.stdin) {
      proc.stdin.write(prompt);
      proc.stdin.end();
    }

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      clearTimeout(timeout);
      const exitCode = code ?? 1;

      if (timedOut) {
        resolve({
          ok: false,
          findings: [],
          error: `opencode timed out after ${EXECUTION_TIMEOUT_MS}ms`,
          exitCode: 124,
        });
        return;
      }

      // Non-zero exit code = failure
      if (exitCode !== 0) {
        resolve({
          ok: false,
          findings: [],
          error: stderr || `opencode exited with code ${exitCode}`,
          exitCode,
        });
        return;
      }

      // Parse structured output
      const parseResult = parseOpencodeOutput(stdout);
      resolve({
        ok: parseResult.ok,
        findings: parseResult.findings,
        error: parseResult.error,
        exitCode: 0,
      });
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timeout);
      resolve({
        ok: false,
        findings: [],
        error: `Failed to spawn opencode: ${err.message}`,
        exitCode: 1,
      });
    });
  });
}

export const opencodeAgent: ReviewAgent = {
  id: 'opencode',
  name: 'OpenCode',
  usesLlm: true,

  supports(file: DiffFile): boolean {
    if (file.status === 'deleted') return false;
    return SUPPORTED_EXTENSIONS.some((ext) => file.path.endsWith(ext));
  },

  async run(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();

    // Check if opencode is installed
    const installCheck = isOpencodeInstalled();
    if (!installCheck.installed) {
      console.log(`[opencode] Not installed: ${installCheck.error}`);
      return {
        agentId: this.id,
        success: false,
        findings: [],
        error: installCheck.error,
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      };
    }

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

    console.log(`[opencode] Running on ${supportedFiles.length} files (tokens stripped)`);

    // Build prompt
    const prompt = buildReviewPrompt(context);

    // Run opencode as untrusted subprocess
    const result = await runOpencode(context, prompt);

    // Security guard: check for listening sockets (CVE mitigation)
    const socketCheck = await validateNoListeningSockets('opencode');
    if (!socketCheck.safe) {
      console.error(`[opencode] SECURITY VIOLATION: ${socketCheck.error}`);
      return {
        agentId: this.id,
        success: false,
        findings: [],
        error: `Security violation: ${socketCheck.error}`,
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      };
    }

    if (!result.ok) {
      console.error(`[opencode] Failed: ${result.error}`);
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

    console.log(`[opencode] Found ${result.findings.length} findings`);

    return {
      agentId: this.id,
      success: true,
      findings: result.findings,
      metrics: {
        durationMs: Date.now() - startTime,
        filesProcessed: supportedFiles.length,
      },
    };
  },
};
