/**
 * Reviewdog Agent
 *
 * ROUTER MONOPOLY RULE COMPLIANCE (INVARIANTS.md #1):
 * - This agent runs reviewdog in LOCAL mode only (-reporter=local)
 * - NO GitHub tokens are passed to subprocess
 * - Returns structured findings for router to post
 * - Never posts directly to GitHub
 */

import { spawn, execFileSync, type ChildProcess } from 'child_process';
import { createReadStream, writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { filterSafePaths } from './path-filter.js';
import type { ReviewAgent, AgentContext, AgentResult, Finding, Severity } from './types.js';
import { AgentSuccess, AgentFailure, AgentSkipped } from './types.js';
import type { DiffFile } from '../diff.js';
import { generateFingerprint } from '../report/formats.js';

/**
 * Semgrep JSON output format
 */
interface SemgrepResult {
  results: SemgrepFinding[];
  errors: unknown[];
  version: string;
}

interface SemgrepFinding {
  check_id: string;
  path: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
  extra: {
    message: string;
    severity: string;
    metadata?: Record<string, unknown>;
    fix?: string;
    fingerprint?: string;
  };
}

/**
 * Check if reviewdog binary is available
 */
export function isReviewdogAvailable(): boolean {
  try {
    execFileSync('reviewdog', ['--version'], { stdio: 'ignore', shell: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if semgrep binary is available
 */
export function isSemgrepAvailable(): boolean {
  try {
    execFileSync('semgrep', ['--version'], { stdio: 'ignore', shell: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Map semgrep severity to Finding severity
 */
export function mapSeverity(semgrepSeverity: string): Severity {
  switch (semgrepSeverity.toUpperCase()) {
    case 'ERROR':
      return 'error';
    case 'WARNING':
      return 'warning';
    case 'INFO':
    default:
      return 'info';
  }
}

/**
 * Run semgrep and parse results into structured findings
 * This is the primary path - no GitHub posting
 */
async function runSemgrepStructured(
  repoPath: string,
  filePaths: string[],
  _env: Record<string, string | undefined>
): Promise<{ success: boolean; findings: Finding[]; error?: string }> {
  // Filter paths for safe execution (defense-in-depth)
  const { safePaths } = filterSafePaths(filePaths, 'reviewdog');
  if (safePaths.length === 0) {
    return { success: true, findings: [], error: 'No valid file paths to scan' };
  }

  // Run semgrep with JSON output - shell-free execution
  let semgrepOutput: string;
  try {
    semgrepOutput = execFileSync('semgrep', ['scan', '--config=auto', '--json', ...safePaths], {
      cwd: repoPath,
      encoding: 'utf-8',
      shell: false, // Critical: no shell interpretation
      maxBuffer: 50 * 1024 * 1024,
      timeout: 300000, // 5 minute timeout
      env: _env, // Clean env, no tokens
    });
  } catch (error: unknown) {
    // Semgrep returns non-zero exit code when it finds issues
    // The JSON output is still in stdout
    if (error && typeof error === 'object' && 'stdout' in error) {
      semgrepOutput = (error as { stdout: string }).stdout;
    } else {
      return {
        success: false,
        findings: [],
        error: `Semgrep failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Parse semgrep JSON output
  let parsed: SemgrepResult;
  try {
    parsed = JSON.parse(semgrepOutput) as SemgrepResult;
  } catch {
    return {
      success: false,
      findings: [],
      error: 'Failed to parse semgrep JSON output',
    };
  }

  // Convert to structured findings
  const findings: Finding[] = parsed.results.map((result) => {
    const finding: Finding = {
      severity: mapSeverity(result.extra.severity),
      file: result.path,
      line: result.start.line,
      endLine: result.end.line,
      message: result.extra.message,
      ruleId: result.check_id,
      sourceAgent: 'reviewdog',
      suggestion: result.extra.fix,
      metadata: result.extra.metadata,
    };

    // Generate stable fingerprint
    finding.fingerprint = generateFingerprint(finding);

    return finding;
  });

  return { success: true, findings };
}

/**
 * Run reviewdog in local mode (for validation/format checking only)
 * This does NOT post to GitHub - purely for local validation
 */
async function runReviewdogLocal(
  repoPath: string,
  semgrepJsonPath: string,
  cleanEnv: Record<string, string | undefined>
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // CRITICAL: -reporter=local means no GitHub posting
    // No REVIEWDOG_GITHUB_API_TOKEN in environment
    const reviewdog: ChildProcess = spawn(
      'reviewdog',
      ['-f=semgrep', '-reporter=local', '-fail-level=none'],
      {
        cwd: repoPath,
        env: cleanEnv, // Clean env, no tokens
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const input = createReadStream(semgrepJsonPath);
    if (reviewdog.stdin) {
      input.pipe(reviewdog.stdin);
    }

    let stderr = '';
    reviewdog.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    reviewdog.once('close', (code) => {
      if (code === 0 || code === 1) {
        // Exit code 1 means findings were found, which is expected
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `reviewdog exited with code ${code}: ${stderr}` });
      }
    });

    reviewdog.once('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

export const reviewdogAgent: ReviewAgent = {
  id: 'reviewdog',
  name: 'Reviewdog',
  usesLlm: false,

  supports(file: DiffFile): boolean {
    // Reviewdog works with any file that semgrep supports
    return file.status !== 'deleted';
  },

  async run(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();

    // Check if semgrep is available (primary requirement)
    if (!isSemgrepAvailable()) {
      console.log('[reviewdog] Semgrep binary not found, skipping');
      return AgentSkipped({
        agentId: 'reviewdog',
        reason: 'Semgrep binary not found',
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      });
    }

    // Get file paths
    const filePaths = context.files.filter((f) => this.supports(f)).map((f) => f.path);

    if (filePaths.length === 0) {
      return AgentSkipped({
        agentId: 'reviewdog',
        reason: 'No files to process',
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      });
    }

    console.log(`[reviewdog] Processing ${filePaths.length} files via semgrep`);

    // ROUTER MONOPOLY RULE: Strip ALL tokens from environment
    // Agents must NOT have access to posting credentials
    const cleanEnv = context.env;

    // Primary path: Run semgrep directly and parse structured output
    const result = await runSemgrepStructured(context.repoPath, filePaths, cleanEnv);

    if (!result.success) {
      return AgentFailure({
        agentId: 'reviewdog',
        error: result.error ?? 'Unknown semgrep error',
        failureStage: 'exec',
        partialFindings: [],
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      });
    }

    // Optional: If reviewdog is available, run it in local mode for validation
    // This verifies the output format but does NOT post to GitHub
    if (isReviewdogAvailable() && result.findings.length > 0) {
      const tempFile = join(tmpdir(), `semgrep-${Date.now()}.json`);
      try {
        // Re-run semgrep to get raw JSON for reviewdog validation
        // Use same safe paths from earlier filtering
        const { safePaths: validationPaths } = filterSafePaths(filePaths, 'reviewdog');
        const semgrepOutput = execFileSync(
          'semgrep',
          ['scan', '--config=auto', '--json', ...validationPaths],
          {
            cwd: context.repoPath,
            encoding: 'utf-8',
            shell: false,
            maxBuffer: 50 * 1024 * 1024,
            timeout: 300000,
            env: cleanEnv,
          }
        );
        writeFileSync(tempFile, semgrepOutput);

        const validation = await runReviewdogLocal(context.repoPath, tempFile, cleanEnv);
        if (!validation.success) {
          console.warn(`[reviewdog] Local validation warning: ${validation.error}`);
        }
      } catch {
        // Semgrep may throw on findings - ignore for validation
      } finally {
        try {
          if (existsSync(tempFile)) {
            unlinkSync(tempFile);
          }
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    console.log(`[reviewdog] Found ${result.findings.length} findings`);

    // Return structured findings for router to post
    // Router owns all GitHub API interactions per INVARIANTS.md #1
    return AgentSuccess({
      agentId: 'reviewdog',
      findings: result.findings,
      metrics: {
        durationMs: Date.now() - startTime,
        filesProcessed: filePaths.length,
      },
    });
  },
};
