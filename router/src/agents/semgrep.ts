/**
 * Semgrep Agent
 * Static analysis using Semgrep for security and bug patterns
 */

import { execSync } from 'child_process';
import type { ReviewAgent, AgentContext, AgentResult, Finding, Severity } from './types.js';
import type { DiffFile } from '../diff.js';
import { buildAgentEnv } from './security.js';

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
];

interface SemgrepResult {
  results: SemgrepFinding[];
  errors: SemgrepError[];
}

interface SemgrepFinding {
  check_id: string;
  path: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
  extra: {
    message: string;
    severity: string;
    fix?: string;
  };
}

interface SemgrepError {
  message: string;
  level: string;
}

export const semgrepAgent: ReviewAgent = {
  id: 'semgrep',
  name: 'Semgrep',
  usesLlm: false,

  supports(file: DiffFile): boolean {
    if (file.status === 'deleted') return false;
    return SUPPORTED_EXTENSIONS.some((ext) => file.path.endsWith(ext));
  },

  async run(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];

    // Get files that Semgrep supports
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

    try {
      const agentEnv = buildAgentEnv('semgrep', context.env);

      // Build file list for Semgrep
      const filePaths = supportedFiles.map((f) => f.path);

      // Run Semgrep with auto config
      const result = execSync(
        `semgrep scan --config=auto --json ${filePaths.map((p) => `"${p}"`).join(' ')}`,
        {
          cwd: context.repoPath,
          encoding: 'utf-8',
          maxBuffer: 50 * 1024 * 1024,
          timeout: 300000, // 5 minute timeout
          env: agentEnv,
        }
      );

      const parsed = JSON.parse(result) as SemgrepResult;

      // Convert Semgrep findings to our format
      for (const finding of parsed.results) {
        findings.push({
          severity: mapSeverity(finding.extra.severity),
          file: finding.path,
          line: finding.start.line,
          endLine: finding.end.line,
          message: finding.extra.message,
          suggestion: finding.extra.fix,
          ruleId: finding.check_id,
          sourceAgent: this.id,
        });
      }

      return {
        agentId: this.id,
        success: true,
        findings,
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: supportedFiles.length,
        },
      };
    } catch (error) {
      // Semgrep exits with non-zero if it finds issues, but still produces JSON output
      const errorOutput =
        error instanceof Error ? (error as { stdout?: string }).stdout : undefined;

      if (errorOutput) {
        try {
          const parsed = JSON.parse(errorOutput) as SemgrepResult;
          for (const finding of parsed.results) {
            findings.push({
              severity: mapSeverity(finding.extra.severity),
              file: finding.path,
              line: finding.start.line,
              endLine: finding.end.line,
              message: finding.extra.message,
              suggestion: finding.extra.fix,
              ruleId: finding.check_id,
              sourceAgent: this.id,
            });
          }

          return {
            agentId: this.id,
            success: true,
            findings,
            metrics: {
              durationMs: Date.now() - startTime,
              filesProcessed: supportedFiles.length,
            },
          };
        } catch {
          // JSON parse failed, treat as error
        }
      }

      return {
        agentId: this.id,
        success: false,
        findings: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      };
    }
  },
};

function mapSeverity(semgrepSeverity: string): Severity {
  switch (semgrepSeverity.toUpperCase()) {
    case 'ERROR':
      return 'error';
    case 'WARNING':
      return 'warning';
    default:
      return 'info';
  }
}
