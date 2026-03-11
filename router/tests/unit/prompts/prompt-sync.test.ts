/**
 * Prompt Sync Test (FR-012)
 *
 * Ensures hardcoded fallback prompts in agent source files contain the same
 * Core Rules AND Framework Convention keywords as the file-based prompts.
 * Prevents drift between normal and degraded modes.
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

/**
 * Check for the 6 Framework Convention keywords in a prompt string.
 * Returns an array of keyword labels that were found.
 */
function extractFrameworkConventions(content: string): string[] {
  const found: string[] = [];

  // Rule 1: Express error middleware
  if (/Express/i.test(content)) found.push('Express');

  // Rule 2: Query library key deduplication (case-insensitive)
  if (/query key/i.test(content)) found.push('query key');

  // Rule 3: Promise.allSettled order preservation
  if (/allSettled/.test(content)) found.push('allSettled');

  // Rule 4: TypeScript _prefix convention
  if (/_prefix/.test(content)) found.push('_prefix');

  // Rule 5: Exhaustive switch enforcement
  if (/exhaustive/i.test(content) || /assertNever/.test(content)) found.push('exhaustive');

  // Rule 6: Constant externalization
  if (/externali/i.test(content)) found.push('externalization');

  return found;
}

/** Normalize whitespace for comparison (collapse runs of whitespace to single space). */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// Resolve paths relative to the repo root (test is at router/tests/unit/prompts/)
const repoRoot = join(import.meta.dirname, '..', '..', '..', '..');

/** Agents that have both file-based prompts AND hardcoded fallbacks. */
const agentPromptFiles = [
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

/** All file-based prompts (includes architecture_review which has no agent fallback). */
const allPromptFiles = [
  ...agentPromptFiles,
  {
    name: 'architecture_review',
    promptPath: join(repoRoot, 'config/prompts/architecture_review.md'),
  },
];

describe('Fallback prompt sync (FR-012)', () => {
  for (const { name, promptPath, agentPath } of agentPromptFiles) {
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

      it('file-based prompt contains JSON-only output instruction', () => {
        const promptContent = readFileSync(promptPath, 'utf-8');
        const hasJsonInstruction =
          /nothing else/.test(promptContent) ||
          /Do NOT include any text before or after the JSON/.test(promptContent);
        expect(
          hasJsonInstruction,
          `${name} file-based prompt is missing a JSON-only output instruction`
        ).toBe(true);
      });

      it('hardcoded fallback contains JSON-only output instruction', () => {
        const agentSource = readFileSync(agentPath, 'utf-8');
        const hasJsonInstruction =
          /nothing else/.test(agentSource) ||
          /Do NOT include any text before or after the JSON/.test(agentSource);
        expect(
          hasJsonInstruction,
          `${name} hardcoded fallback is missing a JSON-only output instruction`
        ).toBe(true);
      });

      it('file-based prompt contains all 6 Framework Convention keywords', () => {
        const promptContent = readFileSync(promptPath, 'utf-8');
        const conventions = extractFrameworkConventions(promptContent);
        expect(
          conventions,
          `${name} file-based prompt missing conventions: expected 6, found [${conventions.join(', ')}]`
        ).toHaveLength(6);
      });

      it('hardcoded fallback contains all 6 Framework Convention keywords', () => {
        const agentSource = readFileSync(agentPath, 'utf-8');
        const conventions = extractFrameworkConventions(agentSource);
        expect(
          conventions,
          `${name} hardcoded fallback missing conventions: expected 6, found [${conventions.join(', ')}]`
        ).toHaveLength(6);
      });
    });
  }

  it('all prompt files exist on disk', () => {
    for (const { name, promptPath } of agentPromptFiles) {
      const content = readFileSync(promptPath, 'utf-8');
      expect(content.length, `${name} prompt file should not be empty`).toBeGreaterThan(0);
      expect(
        content.includes('Core Rules'),
        `${name} prompt file should contain Core Rules section`
      ).toBe(true);
    }
  });
});

describe('Framework Convention prompts (FR-012)', () => {
  for (const entry of allPromptFiles) {
    const { name, promptPath } = entry;

    it(`${name} file-based prompt contains "### Framework & Language Conventions" header`, () => {
      const content = readFileSync(promptPath, 'utf-8');
      expect(
        content.includes('### Framework & Language Conventions'),
        `${name} prompt file missing Framework & Language Conventions header`
      ).toBe(true);
    });

    it(`${name} file-based prompt contains all 6 numbered convention rules`, () => {
      const content = readFileSync(promptPath, 'utf-8');
      for (let i = 1; i <= 6; i++) {
        // eslint-disable-next-line security/detect-non-literal-regexp
        const rulePattern = new RegExp(`${i}\\.\\s+\\*\\*`);
        expect(
          rulePattern.test(content),
          `${name} prompt file missing numbered convention rule ${i}`
        ).toBe(true);
      }
    });

    it(`${name} file-based prompt contains all 6 Framework Convention keywords`, () => {
      const content = readFileSync(promptPath, 'utf-8');
      const conventions = extractFrameworkConventions(content);
      expect(
        conventions,
        `${name} prompt missing conventions: expected 6, found [${conventions.join(', ')}]`
      ).toHaveLength(6);
    });
  }
});
