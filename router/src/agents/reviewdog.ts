/**
 * Reviewdog Agent
 * Pipes linter output through reviewdog for PR annotations
 */

import { spawn, type ChildProcess } from 'child_process';
import { createReadStream, writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import type { ReviewAgent, AgentContext, AgentResult } from './index.js';
import type { DiffFile } from '../diff.js';

/**
 * Check if reviewdog binary is available
 */
function isReviewdogAvailable(): boolean {
  try {
    execSync('reviewdog --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run semgrep and pipe output to reviewdog
 */
async function runReviewdogWithSemgrep(
  repoPath: string,
  filePaths: string[],
  token: string
): Promise<{ success: boolean; error?: string }> {
  // Run semgrep first
  let semgrepOutput: string;
  try {
    semgrepOutput = execSync(
      `semgrep scan --config=auto --json ${filePaths.map((p) => `"${p}"`).join(' ')}`,
      {
        cwd: repoPath,
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 300000, // 5 minute timeout
      }
    );
  } catch (error: unknown) {
    // Semgrep returns non-zero exit code when it finds issues
    // The JSON output is still in stdout
    if (error && typeof error === 'object' && 'stdout' in error) {
      semgrepOutput = (error as { stdout: string }).stdout;
    } else {
      return {
        success: false,
        error: `Semgrep failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Write semgrep output to temp file (avoids shell injection)
  const tempFile = join(tmpdir(), `semgrep-${Date.now()}.json`);

  try {
    writeFileSync(tempFile, semgrepOutput);

    return await new Promise((resolve) => {
      const reviewdog: ChildProcess = spawn(
        'reviewdog',
        ['-f=semgrep', '-reporter=github-pr-review', '-fail-level=warning'],
        {
          env: { ...process.env, REVIEWDOG_GITHUB_API_TOKEN: token },
          stdio: ['pipe', 'inherit', 'inherit'],
        }
      );

      const input = createReadStream(tempFile);
      if (reviewdog.stdin) {
        input.pipe(reviewdog.stdin);
      }

      reviewdog.once('close', (code) => {
        // Cleanup temp file
        try {
          unlinkSync(tempFile);
        } catch {
          // Ignore cleanup errors
        }

        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: `reviewdog exited with code ${code}` });
        }
      });

      reviewdog.once('error', (err) => {
        // Cleanup temp file
        try {
          unlinkSync(tempFile);
        } catch {
          // Ignore cleanup errors
        }
        resolve({ success: false, error: err.message });
      });
    });
  } catch (error) {
    // Cleanup on error
    try {
      if (existsSync(tempFile)) {
        unlinkSync(tempFile);
      }
    } catch {
      // Ignore cleanup errors
    }
    return {
      success: false,
      error: `Failed to run reviewdog: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
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

    // Check if reviewdog is available
    if (!isReviewdogAvailable()) {
      console.log('[reviewdog] Binary not found, skipping');
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

    // Get GitHub token
    const token =
      context.env['REVIEWDOG_GITHUB_API_TOKEN'] ||
      context.env['GITHUB_TOKEN'] ||
      context.env['GH_TOKEN'];

    if (!token) {
      console.log('[reviewdog] No GitHub token available, skipping');
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

    // Get file paths
    const filePaths = context.files.filter((f) => this.supports(f)).map((f) => f.path);

    if (filePaths.length === 0) {
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

    console.log(`[reviewdog] Processing ${filePaths.length} files via semgrep`);

    const result = await runReviewdogWithSemgrep(context.repoPath, filePaths, token);

    if (!result.success) {
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

    // Reviewdog posts directly to GitHub, so we don't return findings
    // The annotations are created via the GitHub API
    return {
      agentId: this.id,
      success: true,
      findings: [],
      metrics: {
        durationMs: Date.now() - startTime,
        filesProcessed: filePaths.length,
      },
    };
  },
};
