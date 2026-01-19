/**
 * PR-Agent (Stub)
 * Fast AI summarizer and reviewer
 * 
 * To be fully implemented in Phase 2
 */

import type { ReviewAgent, AgentContext, AgentResult } from './index.js';
import type { DiffFile } from '../diff.js';

export const prAgentAgent: ReviewAgent = {
    id: 'pr_agent',
    name: 'PR-Agent',
    usesLlm: true,

    supports(file: DiffFile): boolean {
        return file.status !== 'deleted';
    },

    async run(context: AgentContext): Promise<AgentResult> {
        const startTime = Date.now();

        // Check for API key
        const apiKey = context.env['OPENAI_API_KEY'] || context.env['PR_AGENT_API_KEY'];
        if (!apiKey) {
            return {
                agentId: this.id,
                success: false,
                findings: [],
                error: 'No API key configured for PR-Agent (set OPENAI_API_KEY or PR_AGENT_API_KEY)',
                metrics: {
                    durationMs: Date.now() - startTime,
                    filesProcessed: 0,
                },
            };
        }

        // Stub implementation - PR-Agent integration to be added in Phase 2
        console.log(`[pr_agent] Stub: would analyze ${context.files.length} files`);

        return {
            agentId: this.id,
            success: true,
            findings: [],
            metrics: {
                durationMs: Date.now() - startTime,
                filesProcessed: context.files.length,
            },
        };
    },
};
