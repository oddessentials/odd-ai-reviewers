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
import type { DiffFile } from '../diff.js';
import { estimateTokens } from '../budget.js';
import { buildAgentEnv } from './security.js';
import { parseJsonResponse } from './json-utils.js';
import { withRetry } from './retry.js';

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
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })
    );

    // Extract text content
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Anthropic response');
    }

    // Parse and validate JSON (handles Claude's code fence wrapping)
    const parsed = parseJsonResponse(textContent.text, 'Anthropic');

    const result = SemanticResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Schema validation failed: ${result.error.message}`);
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
      return {
        agentId: this.id,
        success: true,
        findings: [],
        metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
      };
    }

    // Load prompt template (shared by all providers)
    let systemPrompt = `You are a senior code reviewer focused on semantic analysis.
Analyze the provided diff for:
- Logic errors and edge cases
- Security vulnerabilities
- Performance issues
- API misuse or anti-patterns
- Missing error handling

Line numbering requirements:
- Use new-file line numbers from unified diff hunk headers (@@ -a,b +c,d @@)
- Only use right-side diff lines (added or context). If unsure, omit the line.

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

    // Switch on provider
    if (provider === 'anthropic') {
      const anthropicKey = agentEnv['ANTHROPIC_API_KEY'];
      if (!anthropicKey) {
        return {
          agentId: this.id,
          success: false,
          findings: [],
          error: 'ANTHROPIC_API_KEY not found despite provider=anthropic',
          metrics: { durationMs: Date.now() - startTime, filesProcessed: 0 },
        };
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
      const response = await withRetry(() =>
        openai.chat.completions.create({
          model: effectiveModel,
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
