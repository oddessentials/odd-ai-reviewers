/**
 * Reviewdog Agent (Stub)
 * Converts tool output to PR annotations
 * 
 * To be fully implemented in Phase 2
 */

import type { ReviewAgent, AgentContext, AgentResult } from './index.js';
import type { DiffFile } from '../diff.js';

export const reviewdogAgent: ReviewAgent = {
    id: 'reviewdog',
    name: 'Reviewdog',
    usesLlm: false,

    supports(_file: DiffFile): boolean {
        // Reviewdog is a formatter/reporter, not a scanner
        // It supports all files
        return true;
    },

    async run(context: AgentContext): Promise<AgentResult> {
        const startTime = Date.now();

        // Stub implementation - reviewdog integration to be added in Phase 2
        console.log(`[reviewdog] Stub: would process ${context.files.length} files`);

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
