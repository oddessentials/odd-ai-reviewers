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
import type { ReviewAgent, AgentContext, AgentResult, Finding, Severity } from './types.js';
import { parseJsonResponse } from './json-utils.js';
import type { DiffFile } from '../diff.js';
import { estimateTokens } from '../budget.js';
import { buildAgentEnv } from './security.js';
import { withRetry } from './retry.js';
import { getCurrentDateUTC } from './date-utils.js';

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
function buildReviewPrompt(context: AgentContext): { system: string; user: string } {
  const currentDate = getCurrentDateUTC();

  const files = context.files
    .filter((f) => f.status !== 'deleted')
    .map((f) => `- ${f.path} (+${f.additions}/-${f.deletions})`)
    .join('\n');

  const systemPrompt = `You are a senior code reviewer specializing in security, performance, and code quality analysis.

Current date (UTC): ${currentDate}

Your task is to review code diffs and identify issues. For each issue found, provide:
- Severity (error, warning, or info)
- File path
- Line number(s) if applicable
- Clear description of the issue
- Suggestion for how to fix it

Focus on:
- Security vulnerabilities (OWASP Top 10, CWE)
- Logic errors and bugs
- Performance issues
- Code quality problems
- Best practice violations

Return your findings as a JSON object. Do NOT include any text before or after the JSON.`;

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
    return {
      agentId,
      success: true,
      findings: [],
      metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
    };
  }

  const openai = new OpenAI({ apiKey });
  const { system, user } = buildReviewPrompt(context);
  const estimatedInputTokens = estimateTokens(system + user);

  try {
    const response = await withRetry(() =>
      openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
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

    return {
      agentId,
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
      agentId,
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
    return {
      agentId,
      success: true,
      findings: [],
      metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
    };
  }

  const { system, user } = buildReviewPrompt(context);
  const estimatedInputTokens = estimateTokens(system + user);

  console.log(`[opencode] Calling Anthropic API with model: ${model}`);
  console.log(`[opencode] Estimated input tokens: ${estimatedInputTokens}`);

  const client = new Anthropic({ apiKey });

  try {
    const response = await withRetry(() =>
      client.messages.create({
        model,
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: user }],
      })
    );

    // Extract text content from response
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Anthropic response');
    }

    // Parse and validate JSON response (handles Claude's code fence wrapping)
    const parsed = parseJsonResponse(textContent.text, 'Anthropic');

    const result = AnthropicResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Schema validation failed: ${result.error.message}`);
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

    return {
      agentId,
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
      agentId,
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
    const agentEnv = buildAgentEnv('opencode', context.env);

    // Router resolves provider and model. Agent trusts context.
    const { provider, effectiveModel } = context;

    console.log(`[opencode] Provider: ${provider}, Model: ${effectiveModel}`);

    // Switch on router-resolved provider
    switch (provider) {
      case 'anthropic': {
        const anthropicKey = agentEnv['ANTHROPIC_API_KEY'];
        if (!anthropicKey) {
          // This should never happen due to preflight, but fail-closed
          return {
            agentId: this.id,
            success: false,
            findings: [],
            error: 'ANTHROPIC_API_KEY not found despite provider=anthropic',
            metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
          };
        }
        return runWithAnthropic(context, anthropicKey, effectiveModel);
      }

      case 'openai': {
        const openaiKey = agentEnv['OPENAI_API_KEY'];
        if (!openaiKey) {
          return {
            agentId: this.id,
            success: false,
            findings: [],
            error: 'OPENAI_API_KEY not found despite provider=openai',
            metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
          };
        }
        return runWithOpenAI(context, openaiKey, effectiveModel);
      }

      case 'azure-openai':
        // TODO: Implement Azure OpenAI path
        return {
          agentId: this.id,
          success: false,
          findings: [],
          error: 'Azure OpenAI support not yet implemented for opencode',
          metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
        };

      default:
        // No valid provider resolved - this is a preflight failure
        return {
          agentId: this.id,
          success: false,
          findings: [],
          error: `No valid provider configured. Provider resolved to: ${provider}`,
          metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
        };
    }
  },
};
