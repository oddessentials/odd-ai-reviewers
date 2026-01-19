/**
 * OpenCode Agent
 * Spawns OpenCode CLI for AI-powered code review
 *
 * Uses the real OpenCode CLI (sst/opencode) with stdin-based prompt input.
 * Requires opencode to be installed in the runtime environment.
 */

import { spawn, execSync } from 'child_process';
import type { ReviewAgent, AgentContext, AgentResult } from './index.js';
import type { DiffFile } from '../diff.js';

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

interface OpencodeResult {
  ok: boolean;
  output: string;
  error?: string;
  exitCode: number;
}

/**
 * Check if opencode CLI is ready (subcommand available + required env vars)
 */
function isOpencodeReady(env: Record<string, string | undefined>): {
  ready: boolean;
  error?: string;
} {
  // 1. Check subcommand availability
  try {
    execSync('opencode github --help', { stdio: 'ignore', timeout: 5000 });
  } catch {
    return { ready: false, error: 'opencode CLI not installed or github subcommand unavailable' };
  }

  // 2. Validate required env vars
  const hasGithubToken = env['GITHUB_TOKEN'] || env['GH_TOKEN'];
  if (!hasGithubToken) {
    return { ready: false, error: 'GITHUB_TOKEN or GH_TOKEN required for opencode' };
  }

  const hasModel = env['OPENCODE_MODEL'] || env['MODEL'];
  if (!hasModel) {
    return { ready: false, error: 'OPENCODE_MODEL or MODEL required for opencode' };
  }

  return { ready: true };
}

/**
 * Build review prompt from context
 */
function buildReviewPrompt(context: AgentContext): string {
  const files = context.files
    .filter((f) => f.status !== 'deleted')
    .map((f) => `- ${f.path} (+${f.additions}/-${f.deletions})`)
    .join('\n');

  return `Review this pull request and provide feedback on code quality, bugs, and improvements.

## Files Changed
${files}

## Diff
\`\`\`diff
${context.diffContent}
\`\`\`

Provide a concise summary and list any issues found.`;
}

/**
 * Run opencode CLI with stdin-based prompt
 */
async function runOpencode(context: AgentContext): Promise<OpencodeResult> {
  const prompt = buildReviewPrompt(context);

  return new Promise((resolve) => {
    const proc = spawn('opencode', ['github', 'run'], {
      env: {
        ...process.env,
        MODEL: context.env['OPENCODE_MODEL'] || context.env['MODEL'] || 'openai/gpt-4o-mini',
        USE_GITHUB_TOKEN: 'true',
        GITHUB_TOKEN: context.env['GITHUB_TOKEN'] || context.env['GH_TOKEN'],
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Write prompt to stdin (correct CLI contract)
    if (proc.stdin) {
      proc.stdin.write(prompt);
      proc.stdin.end();
    }

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const exitCode = code ?? 1;

      // Non-zero exit code = failure
      if (exitCode !== 0) {
        resolve({
          ok: false,
          output: stdout,
          error: stderr || `opencode exited with code ${exitCode}`,
          exitCode,
        });
        return;
      }

      // Check for auth failures in stderr
      if (/auth required|missing token|unauthorized|permission denied/i.test(stderr)) {
        resolve({
          ok: false,
          output: stdout,
          error: `Auth error: ${stderr}`,
          exitCode: 1,
        });
        return;
      }

      resolve({ ok: true, output: stdout, exitCode: 0 });
    });

    proc.on('error', (err) => {
      resolve({
        ok: false,
        output: '',
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

    // Check readiness
    const readiness = isOpencodeReady(context.env);
    if (!readiness.ready) {
      console.log(`[opencode] Not ready: ${readiness.error}`);
      return {
        agentId: this.id,
        success: false,
        findings: [],
        error: readiness.error,
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

    console.log(`[opencode] Running on ${supportedFiles.length} files`);

    // Run opencode CLI
    const result = await runOpencode(context);

    if (!result.ok) {
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

    // OpenCode posts directly to GitHub, so we log the output
    // Findings would be parsed from structured output if available
    console.log(`[opencode] Output: ${result.output.slice(0, 500)}...`);

    return {
      agentId: this.id,
      success: true,
      findings: [], // OpenCode posts its own comments
      metrics: {
        durationMs: Date.now() - startTime,
        filesProcessed: supportedFiles.length,
      },
    };
  },
};
