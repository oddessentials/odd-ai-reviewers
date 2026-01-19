/**
 * AI Semantic Review Agent
 * Direct OpenAI SDK integration for semantic code review
 *
 * This agent uses the OpenAI API directly (like pr_agent) rather than
 * a fictional third-party API. It's designed for semantic analysis
 * of code changes beyond what static analyzers can detect.
 */

import OpenAI from 'openai';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { ReviewAgent, AgentContext, AgentResult, Finding, Severity } from './index.js';
import type { DiffFile } from '../diff.js';
import { estimateTokens } from '../budget.js';

// Retry configuration (same as pr_agent)
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

function getRetryDelayMs(error: unknown, attempt: number): number | null {
  if (error instanceof OpenAI.RateLimitError) {
    const headers = (error as { headers?: Record<string, string> }).headers;
    const retryAfter = headers?.['retry-after'];
    if (retryAfter) return parseInt(retryAfter, 10) * 1000;
    return BASE_DELAY_MS * Math.pow(2, attempt + 2);
  }
  if (error instanceof OpenAI.InternalServerError) return BASE_DELAY_MS * Math.pow(2, attempt);
  if (error instanceof OpenAI.APIConnectionError) return BASE_DELAY_MS * Math.pow(2, attempt);
  if (error instanceof OpenAI.APIError) {
    const status = (error as { status?: number }).status;
    if (status && status >= 500) return BASE_DELAY_MS * Math.pow(2, attempt);
  }
  if (error instanceof OpenAI.AuthenticationError) return null;
  if (error instanceof OpenAI.BadRequestError) return null;
  if (error instanceof OpenAI.NotFoundError) return null;
  if (error instanceof OpenAI.PermissionDeniedError) return null;
  return null;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const delayMs = getRetryDelayMs(error, attempt);
      if (delayMs === null || attempt === MAX_RETRIES - 1) throw error;
      console.log(`[ai_semantic_review] Retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Retry exhausted');
}

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

const PROMPT_PATH = join(import.meta.dirname, '../../config/prompts/semantic_review.md');

interface SemanticReviewResponse {
  findings: SemanticFinding[];
  summary: string;
}

interface SemanticFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
  category: string;
}

export const aiSemanticReviewAgent: ReviewAgent = {
  id: 'ai_semantic_review',
  name: 'AI Semantic Review',
  usesLlm: true,

  supports(file: DiffFile): boolean {
    if (file.status === 'deleted') return false;
    return SUPPORTED_EXTENSIONS.some((ext) => file.path.endsWith(ext));
  },

  async run(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();

    // Check for API key (support both OpenAI and Azure OpenAI)
    const apiKey = context.env['OPENAI_API_KEY'] || context.env['AI_SEMANTIC_REVIEW_API_KEY'];
    const azureEndpoint = context.env['AZURE_OPENAI_ENDPOINT'];
    const azureApiKey = context.env['AZURE_OPENAI_API_KEY'];
    const azureDeployment = context.env['AZURE_OPENAI_DEPLOYMENT'] || 'gpt-4';

    if (!apiKey && !azureApiKey) {
      return {
        agentId: this.id,
        success: false,
        findings: [],
        error: 'No API key configured (set OPENAI_API_KEY or AZURE_OPENAI_API_KEY)',
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      };
    }

    const supportedFiles = context.files.filter((f) => this.supports(f));
    if (supportedFiles.length === 0) {
      return {
        agentId: this.id,
        success: true,
        findings: [],
        metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
      };
    }

    // Initialize OpenAI client
    let openai: OpenAI;
    if (azureEndpoint && azureApiKey) {
      openai = new OpenAI({
        apiKey: azureApiKey,
        baseURL: `${azureEndpoint}/openai/deployments/${azureDeployment}`,
        defaultQuery: { 'api-version': '2024-02-15-preview' },
        defaultHeaders: { 'api-key': azureApiKey },
      });
    } else {
      openai = new OpenAI({ apiKey });
    }

    // Load prompt template
    let systemPrompt = `You are a senior code reviewer focused on semantic analysis.
Analyze the provided diff for:
- Logic errors and edge cases
- Security vulnerabilities
- Performance issues
- API misuse or anti-patterns
- Missing error handling

Return a JSON object with findings.`;

    if (existsSync(PROMPT_PATH)) {
      try {
        systemPrompt = await readFile(PROMPT_PATH, 'utf-8');
      } catch {
        console.log('[ai_semantic_review] Using default prompt');
      }
    }

    const fileSummary = supportedFiles
      .map((f) => `- ${f.path} (${f.status}: +${f.additions}/-${f.deletions})`)
      .join('\n');

    const userPrompt = `## Files Changed
${fileSummary}

## Diff Content
\`\`\`diff
${context.diffContent}
\`\`\`

Analyze this code and return JSON:
{
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "file": "path/to/file.ts",
      "line": 42,
      "message": "Description",
      "suggestion": "How to fix",
      "category": "security|performance|logic|error-handling|api-misuse"
    }
  ],
  "summary": "Brief summary of the review"
}`;

    const estimatedInputTokens = estimateTokens(systemPrompt + userPrompt);

    try {
      const response = await withRetry(() =>
        openai.chat.completions.create({
          model: context.env['OPENAI_MODEL'] || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 4000,
          temperature: 0.3,
        })
      );

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenAI');

      const result = JSON.parse(content) as SemanticReviewResponse;
      const findings: Finding[] = [];

      for (const finding of result.findings || []) {
        findings.push({
          severity: mapSeverity(finding.severity),
          file: finding.file,
          line: finding.line,
          message: finding.message,
          suggestion: finding.suggestion,
          ruleId: `semantic/${finding.category}`,
          sourceAgent: this.id,
        });
      }

      const tokensUsed = response.usage?.total_tokens || estimatedInputTokens;
      const promptTokens = response.usage?.prompt_tokens || estimatedInputTokens;
      const completionTokens = response.usage?.completion_tokens || 0;
      const estimatedCostUsd = (promptTokens / 1000) * 0.00015 + (completionTokens / 1000) * 0.0006;

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

function mapSeverity(severity: string): Severity {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    default:
      return 'info';
  }
}
