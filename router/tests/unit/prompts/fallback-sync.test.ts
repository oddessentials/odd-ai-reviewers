/**
 * Fallback Prompt Sync Test (FR-012)
 *
 * Ensures hardcoded fallback prompts in agent source files contain the same
 * Core Rules as the file-based prompts. Prevents drift between normal and
 * degraded modes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/** Extract the 4 Core Rules from a prompt string (file-based or hardcoded). */
function extractCoreRules(content: string): string[] {
  const rules: string[] = [];

  // Match each numbered rule (1. through 4.) that starts with ALWAYS/NEVER/When
  const rulePatterns = [
    /1\.\s+ALWAYS verify data flow before flagging a security sink\./,
    /2\.\s+ALWAYS quote the exact code construct you are flagging/,
    /3\.\s+NEVER flag a pattern based on generic rules without verifying/,
    /4\.\s+When uncertain about data flow or context/,
  ];

  for (const pattern of rulePatterns) {
    const match = content.match(pattern);
    if (match) {
      rules.push(match[0]);
    }
  }

  return rules;
}

/** Normalize whitespace for comparison (collapse runs of whitespace to single space). */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// Resolve paths relative to the repo root (test is at router/tests/unit/prompts/)
const repoRoot = join(import.meta.dirname, '..', '..', '..', '..');

const promptFiles = [
  {
    name: 'semantic_review',
    promptPath: join(repoRoot, 'config/prompts/semantic_review.md'),
    agentPath: join(repoRoot, 'router/src/agents/ai_semantic_review.ts'),
  },
  {
    name: 'pr_agent',
    promptPath: join(repoRoot, 'config/prompts/pr_agent_review.md'),
    agentPath: join(repoRoot, 'router/src/agents/pr_agent.ts'),
  },
  {
    name: 'opencode',
    promptPath: join(repoRoot, 'config/prompts/opencode_system.md'),
    agentPath: join(repoRoot, 'router/src/agents/opencode.ts'),
  },
];

describe('Fallback prompt sync (FR-012)', () => {
  for (const { name, promptPath, agentPath } of promptFiles) {
    describe(`${name} agent`, () => {
      it('file-based prompt contains all 4 Core Rules', () => {
        const promptContent = readFileSync(promptPath, 'utf-8');
        const rules = extractCoreRules(promptContent);
        expect(rules).toHaveLength(4);
      });

      it('hardcoded fallback contains all 4 Core Rules', () => {
        const agentSource = readFileSync(agentPath, 'utf-8');
        const rules = extractCoreRules(agentSource);
        expect(rules).toHaveLength(4);
      });

      it('Core Rules match between file-based prompt and hardcoded fallback', () => {
        const promptContent = readFileSync(promptPath, 'utf-8');
        const agentSource = readFileSync(agentPath, 'utf-8');

        const promptRules = extractCoreRules(promptContent);
        const agentRules = extractCoreRules(agentSource);

        expect(promptRules).toHaveLength(4);
        expect(agentRules).toHaveLength(4);

        for (let i = 0; i < 4; i++) {
          const agentRule = agentRules[i];
          const promptRule = promptRules[i];
          expect(agentRule).toBeDefined();
          expect(promptRule).toBeDefined();
          expect(
            normalize(agentRule as string),
            `Rule ${i + 1} mismatch in ${name}: file-based prompt and hardcoded fallback have diverged`
          ).toBe(normalize(promptRule as string));
        }
      });
    });
  }

  it('all prompt files exist on disk', () => {
    for (const { name, promptPath } of promptFiles) {
      const content = readFileSync(promptPath, 'utf-8');
      expect(content.length, `${name} prompt file should not be empty`).toBeGreaterThan(0);
      expect(
        content.includes('Core Rules'),
        `${name} prompt file should contain Core Rules section`
      ).toBe(true);
    }
  });
});
