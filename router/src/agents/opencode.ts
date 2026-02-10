/**
 * OpenCode Agent
 * Multi-provider AI-powered code review using OpenAI or Anthropic APIs
 *
 * INVARIANTS ENFORCED:
 * - Router owns posting: Agent returns structured findings only
 * - Agents return structured findings: Output must conform to Finding schema
 * - Preflight validates API keys before execution
 * - Router resolves provider and model: Agent never guesses
 *
 * Per implementation plan:
 * - Switch on context.provider (Anthropic wins when key present)
 * - Use context.effectiveModel (no hardcoded defaults)
 * - Fail if misconfigured (no silent fallback)
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { ReviewAgent, AgentContext, AgentResult, Finding, Severity } from './types.js';
import { AgentSuccess, AgentFailure, AgentSkipped } from './types.js';
import { parseJsonResponse } from './json-utils.js';
import type { DiffFile } from '../diff.js';
import { estimateTokens } from '../budget.js';
import { withRetry } from './retry.js';
import { withTokenCompatibility } from './token-compat.js';
import { getCurrentDateUTC } from './date-utils.js';
import { AgentError, AgentErrorCode } from '../types/errors.js';

const PROMPT_PATH = join(import.meta.dirname, '../../../config/prompts/opencode_system.md');

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

/**
 * Response structure from the LLM
 */
interface OpencodeResponse {
  summary: string;
  findings: OpencodeRawFinding[];
}

interface OpencodeRawFinding {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line?: number;
  end_line?: number;
  message: string;
  suggestion?: string;
  rule_id?: string;
}

/**
 * Build the review prompt for the LLM
 */
async function buildReviewPrompt(context: AgentContext): Promise<{ system: string; user: string }> {
  const currentDate = getCurrentDateUTC();

  const files = context.files
    .filter((f) => f.status !== 'deleted')
    .map((f) => `- ${f.path} (+${f.additions}/-${f.deletions})`)
    .join('\n');

  // Load prompt from file with hardcoded fallback (same pattern as ai_semantic_review)
  let systemPrompt = `You are a senior code reviewer specializing in security, performance, and code quality analysis.

## Core Rules (ALWAYS follow these)

1. ALWAYS verify data flow before flagging a security sink. Only flag innerHTML, eval, dangerouslySetInnerHTML, or similar when user-controlled data actually flows into them. Hardcoded strings, template literals with internal variables, and caught Error objects are NOT security vulnerabilities.
2. ALWAYS quote the exact code construct you are flagging — name the specific selector, function call, variable assignment, or element. If you cannot point to a specific line in the diff, do not report the finding.
3. NEVER flag a pattern based on generic rules without verifying it applies to the specific context. Read the surrounding code, types, and comments before concluding something is an issue.
4. When uncertain about data flow or context (e.g., a function's return value is not visible in the diff), report at "info" severity with an explicit uncertainty qualifier: "Potential issue — verify that [specific concern]."

Focus on:
- Security vulnerabilities (OWASP Top 10, CWE) — only where user-controlled data is involved
- Logic errors and bugs
- Performance issues
- Code quality problems

Return your findings as a JSON object. Do NOT include any text before or after the JSON.`;

  if (existsSync(PROMPT_PATH)) {
    try {
      systemPrompt = await readFile(PROMPT_PATH, 'utf-8');
    } catch {
      console.log('[opencode] Using default prompt (failed to load template)');
    }
  }

  // Prepend date once at the top
  systemPrompt = `Current date (UTC): ${currentDate}\n\n${systemPrompt}`;

  const userPrompt = `## Files Changed
${files}

## Diff
\`\`\`diff
${context.diffContent}
\`\`\`

Review this code diff and return a JSON object with the following structure:
{
  "summary": "Brief overall assessment of the changes",
  "findings": [
    {
      "severity": "error|warning|info",
      "file": "path/to/file.ts",
      "line": 42,
      "end_line": 45,
      "message": "Description of the issue",
      "suggestion": "How to fix it",
      "rule_id": "category/rule-name"
    }
  ]
}

If no issues are found, return an empty findings array.`;

  return { system: systemPrompt, user: userPrompt };
}

/**
 * Map raw severity to Finding severity
 */
function mapSeverity(raw: string): Severity {
  switch (raw) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * Run review using OpenAI API
 */
async function runWithOpenAI(
  context: AgentContext,
  apiKey: string,
  model: string
): Promise<AgentResult> {
  const startTime = Date.now();
  const agentId = 'opencode';

  const supportedFiles = context.files.filter((f) =>
    SUPPORTED_EXTENSIONS.some((ext) => f.path.endsWith(ext))
  );

  if (supportedFiles.length === 0) {
    return AgentSkipped({
      agentId,
      reason: 'No supported files to review',
      metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
    });
  }

  const openai = new OpenAI({ apiKey });
  const { system, user } = await buildReviewPrompt(context);
  const estimatedInputTokens = estimateTokens(system + user);

  try {
    const response = await withTokenCompatibility(
      (tokenParam) =>
        withRetry(() =>
          openai.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            response_format: { type: 'json_object' },
            ...tokenParam,
            temperature: 0.3,
          })
        ),
      context.config.limits.max_completion_tokens,
      model
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new AgentError('Empty response from OpenAI', AgentErrorCode.EXECUTION_FAILED, {
        agentId,
        phase: 'response-extraction',
      });
    }

    const result = JSON.parse(content) as OpencodeResponse;
    const findings: Finding[] = [];

    for (const raw of result.findings || []) {
      findings.push({
        severity: mapSeverity(raw.severity),
        file: raw.file,
        line: raw.line,
        endLine: raw.end_line,
        message: raw.message,
        suggestion: raw.suggestion,
        ruleId: raw.rule_id || 'opencode/ai-review',
        sourceAgent: agentId,
      });
    }

    if (result.summary) {
      console.log(`[opencode] Summary: ${result.summary}`);
    }

    const tokensUsed = response.usage?.total_tokens || estimatedInputTokens;
    const promptTokens = response.usage?.prompt_tokens || estimatedInputTokens;
    const completionTokens = response.usage?.completion_tokens || 0;
    const estimatedCostUsd = (promptTokens / 1000) * 0.00015 + (completionTokens / 1000) * 0.0006;

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
            error instanceof Error ? error.message : 'Unknown OpenAI error',
            AgentErrorCode.EXECUTION_FAILED,
            { agentId, phase: 'openai-call' }
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

/**
 * Zod schema for validating Anthropic JSON response
 */
const AnthropicResponseSchema = z.object({
  summary: z.string(),
  findings: z.array(
    z.object({
      severity: z.enum(['error', 'warning', 'info']),
      file: z.string(),
      line: z.number().optional(),
      end_line: z.number().optional(),
      message: z.string(),
      suggestion: z.string().optional(),
      rule_id: z.string().optional(),
    })
  ),
});

/**
 * Run code review using Anthropic Claude API
 */
async function runWithAnthropic(
  context: AgentContext,
  apiKey: string,
  model: string
): Promise<AgentResult> {
  const agentId = 'opencode';
  const startTime = Date.now();

  // Get supported files
  const supportedFiles = context.files.filter((f) => {
    if (f.status === 'deleted') return false;
    return SUPPORTED_EXTENSIONS.some((ext) => f.path.endsWith(ext));
  });

  if (supportedFiles.length === 0) {
    return AgentSkipped({
      agentId,
      reason: 'No supported files to review',
      metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
    });
  }

  const { system, user } = await buildReviewPrompt(context);
  const estimatedInputTokens = estimateTokens(system + user);

  console.log(`[opencode] Calling Anthropic API with model: ${model}`);
  console.log(`[opencode] Estimated input tokens: ${estimatedInputTokens}`);

  const client = new Anthropic({ apiKey });

  try {
    const response = await withRetry(() =>
      client.messages.create({
        model,
        max_tokens: context.config.limits.max_completion_tokens,
        system,
        messages: [{ role: 'user', content: user }],
      })
    );

    // Extract text content from response
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

    // Parse and validate JSON response (handles Claude's code fence wrapping)
    const parsed = parseJsonResponse(textContent.text, 'Anthropic');

    const result = AnthropicResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new AgentError(
        `Schema validation failed: ${result.error.message}`,
        AgentErrorCode.PARSE_ERROR,
        { agentId, phase: 'schema-validation' }
      );
    }

    const findings: Finding[] = result.data.findings.map((raw) => ({
      severity: mapSeverity(raw.severity),
      file: raw.file,
      line: raw.line,
      endLine: raw.end_line,
      message: raw.message,
      suggestion: raw.suggestion,
      ruleId: raw.rule_id || 'opencode/anthropic-review',
      sourceAgent: agentId,
    }));

    if (result.data.summary) {
      console.log(`[opencode] Summary: ${result.data.summary}`);
    }

    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    // Anthropic pricing: ~$15/1M input, ~$75/1M output for claude-3.5-sonnet
    const estimatedCostUsd =
      response.usage.input_tokens * 0.000015 + response.usage.output_tokens * 0.000075;

    console.log(`[opencode] Completed. Tokens: ${tokensUsed}, Findings: ${findings.length}`);

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
    const agentEnv = context.env;

    // Router resolves provider and model. Agent trusts context.
    const { provider, effectiveModel } = context;

    console.log(`[opencode] Provider: ${provider}, Model: ${effectiveModel}`);

    // Switch on router-resolved provider
    switch (provider) {
      case 'anthropic': {
        const anthropicKey = agentEnv['ANTHROPIC_API_KEY'];
        if (!anthropicKey) {
          // This should never happen due to preflight, but fail-closed
          return AgentFailure({
            agentId: this.id,
            error: 'ANTHROPIC_API_KEY not found despite provider=anthropic',
            failureStage: 'preflight',
            metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
          });
        }
        return runWithAnthropic(context, anthropicKey, effectiveModel);
      }

      case 'openai': {
        const openaiKey = agentEnv['OPENAI_API_KEY'];
        if (!openaiKey) {
          return AgentFailure({
            agentId: this.id,
            error: 'OPENAI_API_KEY not found despite provider=openai',
            failureStage: 'preflight',
            metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
          });
        }
        return runWithOpenAI(context, openaiKey, effectiveModel);
      }

      case 'azure-openai':
        // TODO: Implement Azure OpenAI path
        return AgentFailure({
          agentId: this.id,
          error: 'Azure OpenAI support not yet implemented for opencode',
          failureStage: 'preflight',
          metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
        });

      default:
        // No valid provider resolved - this is a preflight failure
        return AgentFailure({
          agentId: this.id,
          error: `No valid provider configured. Provider resolved to: ${provider}`,
          failureStage: 'preflight',
          metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
        });
    }
  },
};
