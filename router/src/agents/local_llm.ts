/**
 * Local LLM Agent (Stub)
 * Uses Ollama or llama.cpp for local inference
 * 
 * To be fully implemented in Phase 3
 */

import type { ReviewAgent, AgentContext, AgentResult } from './index.js';
import type { DiffFile } from '../diff.js';

export const localLlmAgent: ReviewAgent = {
    id: 'local_llm',
    name: 'Local LLM (Ollama)',
    usesLlm: true,

    supports(file: DiffFile): boolean {
        return file.status !== 'deleted';
    },

    async run(context: AgentContext): Promise<AgentResult> {
        const startTime = Date.now();

        // Check for Ollama endpoint
        const ollamaUrl = context.env['OLLAMA_BASE_URL'] || 'http://localhost:11434';

        // Stub implementation - Ollama integration to be added in Phase 3
        console.log(`[local_llm] Stub: would connect to ${ollamaUrl} and analyze ${context.files.length} files`);

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
