/**
 * AI Semantic Review Agent
 * Multi-provider AI semantic code review
 *
 * INVARIANTS:
 * - Router owns provider/model resolution
 * - Agent receives context.provider and context.effectiveModel
 * - No per-agent defaults, no legacy key references
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { ReviewAgent, AgentContext, AgentResult, Finding, Severity } from './types.js';
import { AgentSuccess, AgentFailure, AgentSkipped } from './types.js';
import type { DiffFile } from '../diff.js';
import { estimateTokens } from '../budget.js';
import { buildAgentEnv } from './security.js';
import { parseJsonResponse } from './json-utils.js';
import { withRetry } from './retry.js';
import { withTokenCompatibility } from './token-compat.js';
import { AgentError, AgentErrorCode } from '../types/errors.js';

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

/**
 * Zod schema for validating Anthropic JSON response
 */
const SemanticResponseSchema = z.object({
  summary: z.string(),
  findings: z.array(
    z.object({
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
      file: z.string(),
      line: z.number().optional(),
      message: z.string(),
      suggestion: z.string().optional(),
      category: z.string(),
    })
  ),
});

/**
 * Run semantic review using Anthropic Claude API
 */
async function runWithAnthropic(
  context: AgentContext,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  supportedFiles: DiffFile[],
  estimatedInputTokens: number
): Promise<AgentResult> {
  const agentId = 'ai_semantic_review';
  const startTime = Date.now();

  console.log(`[ai_semantic_review] Calling Anthropic API with model: ${model}`);

  const client = new Anthropic({ apiKey });

  try {
    const response = await withRetry(() =>
      client.messages.create({
        model,
        max_tokens: context.config.limits.max_completion_tokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })
    );

    // Extract text content
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new AgentError(
        'No text content in Anthropic response',
        AgentErrorCode.EXECUTION_FAILED,
        {
          agentId,
          phase: 'response-extraction',
        }
      );
    }

    // Parse and validate JSON (handles Claude's code fence wrapping)
    const parsed = parseJsonResponse(textContent.text, 'Anthropic');

    const result = SemanticResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new AgentError(
        `Schema validation failed: ${result.error.message}`,
        AgentErrorCode.PARSE_ERROR,
        { agentId, phase: 'schema-validation' }
      );
    }

    const findings: Finding[] = result.data.findings.map((f) => ({
      severity: mapSeverity(f.severity),
      file: f.file,
      line: f.line,
      message: f.message,
      suggestion: f.suggestion,
      ruleId: `semantic/${f.category}`,
      sourceAgent: agentId,
    }));

    if (result.data.summary) {
      console.log(`[ai_semantic_review] Summary: ${result.data.summary}`);
    }

    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    const estimatedCostUsd =
      response.usage.input_tokens * 0.000015 + response.usage.output_tokens * 0.000075;

    return AgentSuccess({
      agentId,
      findings,
      metrics: {
        durationMs: Date.now() - startTime,
        filesProcessed: supportedFiles.length,
        tokensUsed,
        estimatedCostUsd,
      },
    });
  } catch (error) {
    // Convert to AgentError for consistent error handling
    const agentError =
      error instanceof AgentError
        ? error
        : new AgentError(
            error instanceof Error ? error.message : 'Unknown Anthropic error',
            AgentErrorCode.EXECUTION_FAILED,
            { agentId, phase: 'anthropic-call' }
          );

    return AgentFailure({
      agentId,
      error: agentError.message,
      failureStage: 'exec',
      metrics: {
        durationMs: Date.now() - startTime,
        filesProcessed: 0,
        tokensUsed: estimatedInputTokens,
      },
    });
  }
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

    const agentEnv = buildAgentEnv('ai_semantic_review', context.env);

    // Use router-resolved provider and model
    const { provider, effectiveModel } = context;
    console.log(`[ai_semantic_review] Provider: ${provider}, Model: ${effectiveModel}`);

    // Get files that this agent supports (shared by all providers)
    const supportedFiles = context.files.filter((f) => this.supports(f));
    if (supportedFiles.length === 0) {
      return AgentSkipped({
        agentId: this.id,
        reason: 'No supported files to process',
        metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
      });
    }

    // Load prompt template (shared by all providers)
    let systemPrompt = `You are a senior code reviewer focused on semantic analysis.

## Core Rules (ALWAYS follow these)

1. ALWAYS verify data flow before flagging a security sink. Only flag innerHTML, eval, dangerouslySetInnerHTML, or similar when user-controlled data actually flows into them. Hardcoded strings, template literals with internal variables, and caught Error objects are NOT security vulnerabilities.
2. ALWAYS quote the exact code construct you are flagging — name the specific selector, function call, variable assignment, or element. If you cannot point to a specific line in the diff, do not report the finding.
3. NEVER flag a pattern based on generic rules without verifying it applies to the specific context. Read the surrounding code, types, and comments before concluding something is an issue.
4. When uncertain about data flow or context (e.g., a function's return value is not visible in the diff), report at "info" severity with an explicit uncertainty qualifier: "Potential issue — verify that [specific concern]."

Analyze the provided diff for:
- Logic errors and edge cases
- Security vulnerabilities — only where user-controlled data is involved
- Performance issues
- API misuse or anti-patterns
- Missing error handling

Line numbering requirements:
- Use new-file line numbers from unified diff hunk headers (@@ -a,b +c,d @@)
- Only use right-side diff lines (added or context). If unsure, omit the line.

Return a JSON object with findings. Do NOT include any text before or after the JSON.`;

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

    // Switch on provider
    if (provider === 'anthropic') {
      const anthropicKey = agentEnv['ANTHROPIC_API_KEY'];
      if (!anthropicKey) {
        return AgentFailure({
          agentId: this.id,
          error: 'ANTHROPIC_API_KEY not found despite provider=anthropic',
          failureStage: 'preflight',
          metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
        });
      }
      return runWithAnthropic(
        context,
        anthropicKey,
        effectiveModel,
        systemPrompt,
        userPrompt,
        supportedFiles,
        estimatedInputTokens
      );
    }

    // OpenAI / Azure OpenAI path
    const apiKey = agentEnv['OPENAI_API_KEY'];
    const azureEndpoint = agentEnv['AZURE_OPENAI_ENDPOINT'];
    const azureApiKey = agentEnv['AZURE_OPENAI_API_KEY'];
    const azureDeployment = agentEnv['AZURE_OPENAI_DEPLOYMENT'] || 'gpt-4';

    if (!apiKey && !azureApiKey) {
      return AgentFailure({
        agentId: this.id,
        error: 'No API key configured (set OPENAI_API_KEY or AZURE_OPENAI_API_KEY)',
        failureStage: 'preflight',
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
        },
      });
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

    try {
      const response = await withTokenCompatibility(
        (tokenParam) =>
          withRetry(() =>
            openai.chat.completions.create({
              model: effectiveModel,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              response_format: { type: 'json_object' },
              ...tokenParam,
              temperature: 0.3,
            })
          ),
        context.config.limits.max_completion_tokens,
        effectiveModel
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new AgentError('Empty response from OpenAI', AgentErrorCode.EXECUTION_FAILED, {
          agentId: this.id,
          phase: 'response-extraction',
        });
      }

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

      return AgentSuccess({
        agentId: this.id,
        findings,
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: supportedFiles.length,
          tokensUsed,
          estimatedCostUsd,
        },
      });
    } catch (error) {
      // Convert to AgentError for consistent error handling
      const agentError =
        error instanceof AgentError
          ? error
          : new AgentError(
              error instanceof Error ? error.message : 'Unknown OpenAI error',
              AgentErrorCode.EXECUTION_FAILED,
              { agentId: this.id, phase: 'openai-call' }
            );

      return AgentFailure({
        agentId: this.id,
        error: agentError.message,
        failureStage: 'exec',
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: 0,
          tokensUsed: estimatedInputTokens,
        },
      });
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
