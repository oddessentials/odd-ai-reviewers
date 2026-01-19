/**
 * OpenCode.ai Agent
 * AI-powered semantic code review
 */

import type { ReviewAgent, AgentContext, AgentResult, Finding, Severity } from './index.js';
import type { DiffFile } from '../diff.js';
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

// OpenCode.ai API endpoint
const OPENCODE_API_URL = 'https://api.opencode.ai/v1/review';

interface OpenCodeRequest {
  diff: string;
  context?: string;
  config?: {
    focus?: string[];
    severity_threshold?: string;
  };
}

interface OpenCodeResponse {
  findings: OpenCodeFinding[];
  summary: string;
  tokens_used: number;
}

interface OpenCodeFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
  category: string;
}

export const opencodeAgent: ReviewAgent = {
  id: 'opencode',
  name: 'OpenCode.ai',
  usesLlm: true,

  supports(file: DiffFile): boolean {
    if (file.status === 'deleted') return false;
    return SUPPORTED_EXTENSIONS.some((ext) => file.path.endsWith(ext));
  },

  async run(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];

    // Check for API key
    const apiKey = context.env['OPENCODE_API_KEY'];
    if (!apiKey) {
      return {
        agentId: this.id,
        success: false,
        findings: [],
        error: 'OPENCODE_API_KEY environment variable not set',
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      };
    }

    // Get files that OpenCode supports
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

    const estimatedInputTokens = estimateTokens(context.diffContent);

    try {
      const request: OpenCodeRequest = {
        diff: context.diffContent,
        config: {
          focus: ['security', 'bugs', 'performance', 'maintainability'],
          severity_threshold: 'low',
        },
      };

      const response = await fetch(OPENCODE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenCode API error: ${response.status} - ${errorText}`);
      }

      const result = (await response.json()) as OpenCodeResponse;

      // Convert OpenCode findings to our format
      for (const finding of result.findings) {
        findings.push({
          severity: mapSeverity(finding.severity),
          file: finding.file,
          line: finding.line,
          message: finding.message,
          suggestion: finding.suggestion,
          ruleId: finding.category,
          sourceAgent: this.id,
        });
      }

      // Calculate estimated cost (approximate GPT-4 pricing)
      const tokensUsed = result.tokens_used || estimatedInputTokens;
      const estimatedCostUsd = (tokensUsed / 1000) * 0.01 + ((tokensUsed * 0.2) / 1000) * 0.03;

      return {
        agentId: this.id,
        success: true,
        findings,
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: supportedFiles.length,
          tokensUsed,
          estimatedCostUsd,
        },
      };
    } catch (error) {
      return {
        agentId: this.id,
        success: false,
        findings: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
          tokensUsed: estimatedInputTokens,
        },
      };
    }
  },
};

function mapSeverity(opencodeSeverity: string): Severity {
  switch (opencodeSeverity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    default:
      return 'info';
  }
}
