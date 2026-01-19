import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import OpenAI from 'openai';
import type { ReviewAgent, AgentContext, AgentResult, Finding, Severity } from './index.js';
import type { DiffFile } from '../diff.js';
import { estimateTokens } from '../budget.js';

// Retry configuration
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

/**
 * Determine retry delay for an error, or null if non-retryable.
 * - 429 Rate Limit: retry with Retry-After header or longer backoff
 * - 5xx/timeout: retryable with exponential backoff
 * - 4xx (except 429): non-retryable
 */
function getRetryDelayMs(error: unknown, attempt: number): number | null {
  // 429 Rate Limit: retry with Retry-After or extended exponential backoff
  if (error instanceof OpenAI.RateLimitError) {
    const headers = (error as { headers?: Record<string, string> }).headers;
    const retryAfter = headers?.['retry-after'];
    if (retryAfter) {
      return parseInt(retryAfter, 10) * 1000;
    }
    // Longer backoff for rate limits (start at 4x base delay)
    return BASE_DELAY_MS * Math.pow(2, attempt + 2);
  }

  // 5xx errors: retryable
  if (error instanceof OpenAI.InternalServerError) {
    return BASE_DELAY_MS * Math.pow(2, attempt);
  }

  // Connection/timeout errors: retryable
  if (error instanceof OpenAI.APIConnectionError) {
    return BASE_DELAY_MS * Math.pow(2, attempt);
  }

  // Generic API error with status code
  if (error instanceof OpenAI.APIError) {
    const status = (error as { status?: number }).status;
    if (status && status >= 500) {
      return BASE_DELAY_MS * Math.pow(2, attempt);
    }
  }

  // 4xx errors (except 429): non-retryable
  if (error instanceof OpenAI.AuthenticationError) return null;
  if (error instanceof OpenAI.BadRequestError) return null;
  if (error instanceof OpenAI.NotFoundError) return null;
  if (error instanceof OpenAI.PermissionDeniedError) return null;

  // Unknown errors: don't retry
  return null;
}

/**
 * Execute a function with exponential backoff retries
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const delayMs = getRetryDelayMs(error, attempt);
      const isLastAttempt = attempt === MAX_RETRIES - 1;

      if (delayMs === null || isLastAttempt) {
        throw error;
      }

      console.log(
        `[pr_agent] Retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Retry exhausted');
}

// Supported file extensions for PR-Agent review
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
  '.md',
  '.json',
  '.yaml',
  '.yml',
];

// Default prompt path
const PROMPT_PATH = join(import.meta.dirname, '../../config/prompts/pr_agent_review.md');

/**
 * Response structure from OpenAI
 */
interface PRAgentResponse {
  summary: string;
  type: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test' | 'chore';
  findings: PRAgentFinding[];
  overall_assessment: 'approve' | 'comment' | 'request_changes';
}

interface PRAgentFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export const prAgentAgent: ReviewAgent = {
  id: 'pr_agent',
  name: 'PR-Agent',
  usesLlm: true,

  supports(file: DiffFile): boolean {
    if (file.status === 'deleted') return false;
    return SUPPORTED_EXTENSIONS.some((ext) => file.path.endsWith(ext));
  },

  async run(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();

    // Check for API key (support both OpenAI and Azure OpenAI)
    const apiKey = context.env['OPENAI_API_KEY'] || context.env['PR_AGENT_API_KEY'];
    const azureEndpoint = context.env['AZURE_OPENAI_ENDPOINT'];
    const azureApiKey = context.env['AZURE_OPENAI_API_KEY'];
    const azureDeployment = context.env['AZURE_OPENAI_DEPLOYMENT'] || 'gpt-4';

    if (!apiKey && !azureApiKey) {
      return {
        agentId: this.id,
        success: false,
        findings: [],
        error:
          'No API key configured for PR-Agent (set OPENAI_API_KEY, PR_AGENT_API_KEY, or AZURE_OPENAI_API_KEY)',
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      };
    }

    // Get files that PR-Agent supports
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

    // Initialize OpenAI client
    let openai: OpenAI;
    if (azureEndpoint && azureApiKey) {
      // Azure OpenAI
      openai = new OpenAI({
        apiKey: azureApiKey,
        baseURL: `${azureEndpoint}/openai/deployments/${azureDeployment}`,
        defaultQuery: { 'api-version': '2024-02-15-preview' },
        defaultHeaders: { 'api-key': azureApiKey },
      });
    } else {
      // Standard OpenAI
      openai = new OpenAI({ apiKey });
    }

    // Load prompt template
    let systemPrompt = `You are a senior code reviewer. Analyze the provided diff and return a structured JSON response.`;
    if (existsSync(PROMPT_PATH)) {
      try {
        systemPrompt = await readFile(PROMPT_PATH, 'utf-8');
      } catch {
        console.log('[pr_agent] Using default prompt (failed to load template)');
      }
    }

    // Build file summary for context
    const fileSummary = supportedFiles
      .map((f) => `- ${f.path} (${f.status}: +${f.additions}/-${f.deletions})`)
      .join('\n');

    const userPrompt = `## Files Changed
${fileSummary}

## Diff Content
\`\`\`diff
${context.diffContent}
\`\`\`

Analyze this pull request and provide your review as a JSON object with the following structure:
{
  "summary": "Brief description of what this PR does",
  "type": "feature|bugfix|refactor|docs|test|chore",
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "file": "path/to/file.ts",
      "line": 42,
      "message": "Description of the issue",
      "suggestion": "How to fix it (optional)"
    }
  ],
  "overall_assessment": "approve|comment|request_changes"
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
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse the JSON response
      const result = JSON.parse(content) as PRAgentResponse;
      const findings: Finding[] = [];

      // Convert findings to our format
      for (const finding of result.findings || []) {
        findings.push({
          severity: mapSeverity(finding.severity),
          file: finding.file,
          line: finding.line,
          message: finding.message,
          suggestion: finding.suggestion,
          ruleId: `pr-agent/${result.type}`,
          sourceAgent: this.id,
        });
      }

      // Add summary as an info-level finding if there are no issues
      if (findings.length === 0 && result.summary) {
        console.log(`[pr_agent] Summary: ${result.summary}`);
        console.log(`[pr_agent] Assessment: ${result.overall_assessment}`);
      }

      // Calculate token usage and cost
      const tokensUsed = response.usage?.total_tokens || estimatedInputTokens;
      const promptTokens = response.usage?.prompt_tokens || estimatedInputTokens;
      const completionTokens = response.usage?.completion_tokens || 0;

      // Approximate cost (GPT-4o-mini pricing)
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        agentId: this.id,
        success: false,
        findings: [],
        error: errorMessage,
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
          tokensUsed: estimatedInputTokens,
        },
      };
    }
  },
};

/**
 * Map PR-Agent severity to our standard severity
 */
function mapSeverity(prAgentSeverity: string): Severity {
  switch (prAgentSeverity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    default:
      return 'info';
  }
}
