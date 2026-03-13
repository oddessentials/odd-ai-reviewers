/**
 * Prompt Sync Test (FR-012, FR-011)
 *
 * Ensures hardcoded fallback prompts in agent source files contain the same
 * Core Rules, Framework Convention keywords, AND Active Context Directives
 * as the file-based prompts. Prevents drift between normal and degraded modes.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SHARED_CONVENTIONS_HASH,
  SHARED_CONVENTIONS_SUMMARY,
} from '../../../src/prompts/shared-conventions.generated.js';

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
 * Check for all 12 convention keywords in a prompt string (6 framework + 6 shared).
 * Returns an array of keyword labels that were found.
 */
function extractFrameworkConventions(content: string): string[] {
  const found: string[] = [];

  // Framework conventions (1-6)

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

  // Shared conventions (7-12)

  // Rule 7: Existence verification before reporting
  if (
    /existence verification/i.test(content) ||
    /Verify the specific code construct/i.test(content)
  )
    found.push('existence verification');

  // Rule 8: TypeScript type-system trust
  if (/type-system trust/i.test(content) || /TypeScript type-system/i.test(content))
    found.push('type-system trust');

  // Rule 9: No business-decision findings
  if (/business-decision/i.test(content)) found.push('business-decision');

  // Rule 10: No cosmetic refactoring suggestions
  if (/cosmetic refactoring/i.test(content)) found.push('cosmetic refactoring');

  // Rule 11: Developer tooling files
  if (/developer tooling/i.test(content) || /Developer tooling files/i.test(content))
    found.push('developer tooling');

  // Rule 12: React useRef pattern
  if (/useRef/i.test(content)) found.push('React useRef');

  return found;
}

/**
 * Check for Active Context Directive keywords in a prompt string.
 * Returns an array of directive labels that were found.
 */
function extractActiveContextDirectives(content: string): string[] {
  const found: string[] = [];

  // Directive 1: CHECK Project Rules
  if (/Project Rules/i.test(content)) found.push('Project Rules');

  // Directive 2: CHECK PR Description
  if (/PR Description/i.test(content)) found.push('PR Description');

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

      it('file-based prompt contains all 12 convention keywords (6 framework + 6 shared)', () => {
        const promptContent = readFileSync(promptPath, 'utf-8');
        const conventions = extractFrameworkConventions(promptContent);
        expect(
          conventions,
          `${name} file-based prompt missing conventions: expected 12, found [${conventions.join(', ')}]`
        ).toHaveLength(12);
      });

      it('hardcoded fallback contains 6 framework convention keywords + SHARED_CONVENTIONS_SUMMARY import', () => {
        const agentSource = readFileSync(agentPath, 'utf-8');
        // Agent fallbacks contain the 6 original framework conventions inline
        // plus conventions 7-12 via the SHARED_CONVENTIONS_SUMMARY import
        const conventions = extractFrameworkConventions(agentSource);
        expect(
          conventions.length,
          `${name} hardcoded fallback missing framework conventions: found [${conventions.join(', ')}]`
        ).toBeGreaterThanOrEqual(6);
        expect(
          agentSource.includes('SHARED_CONVENTIONS_SUMMARY'),
          `${name} hardcoded fallback must import SHARED_CONVENTIONS_SUMMARY for conventions 7-12`
        ).toBe(true);
      });

      it('file-based prompt contains Active Context Directives section', () => {
        const promptContent = readFileSync(promptPath, 'utf-8');
        expect(
          promptContent.includes('### Active Context Directives'),
          `${name} file-based prompt missing Active Context Directives header`
        ).toBe(true);
      });

      it('file-based prompt contains both Active Context Directive keywords', () => {
        const promptContent = readFileSync(promptPath, 'utf-8');
        const directives = extractActiveContextDirectives(promptContent);
        expect(
          directives,
          `${name} file-based prompt missing directives: expected 2, found [${directives.join(', ')}]`
        ).toHaveLength(2);
      });

      it('hardcoded fallback contains Active Context Directives section', () => {
        const agentSource = readFileSync(agentPath, 'utf-8');
        expect(
          agentSource.includes('Active Context Directives'),
          `${name} hardcoded fallback missing Active Context Directives`
        ).toBe(true);
      });

      it('hardcoded fallback contains both Active Context Directive keywords', () => {
        const agentSource = readFileSync(agentPath, 'utf-8');
        const directives = extractActiveContextDirectives(agentSource);
        expect(
          directives,
          `${name} hardcoded fallback missing directives: expected 2, found [${directives.join(', ')}]`
        ).toHaveLength(2);
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

    it(`${name} file-based prompt contains all 12 numbered convention rules`, () => {
      const content = readFileSync(promptPath, 'utf-8');
      for (let i = 1; i <= 12; i++) {
        // eslint-disable-next-line security/detect-non-literal-regexp
        const rulePattern = new RegExp(`${i}\\.\\s+\\*\\*`);
        expect(
          rulePattern.test(content),
          `${name} prompt file missing numbered convention rule ${i}`
        ).toBe(true);
      }
    });

    it(`${name} file-based prompt contains all 12 convention keywords (6 framework + 6 shared)`, () => {
      const content = readFileSync(promptPath, 'utf-8');
      const conventions = extractFrameworkConventions(content);
      expect(
        conventions,
        `${name} prompt missing conventions: expected 12, found [${conventions.join(', ')}]`
      ).toHaveLength(12);
    });
  }
});

describe('Shared conventions hash validation (T008)', () => {
  const sharedConventionsPath = join(repoRoot, 'config/prompts/_shared_conventions.md');

  it('SHARED_CONVENTIONS_HASH matches SHA-256 of _shared_conventions.md', () => {
    const content = readFileSync(sharedConventionsPath, 'utf-8');
    const computedHash = createHash('sha256').update(content).digest('hex');
    expect(
      SHARED_CONVENTIONS_HASH,
      `Shared conventions hash mismatch: generated file is stale. Run \`pnpm prompts:sync\` to regenerate.`
    ).toBe(computedHash);
  });

  it('all 4 prompt files contain shared conventions content matching the source file', () => {
    const sourceContent = readFileSync(sharedConventionsPath, 'utf-8');

    for (const { name, promptPath } of allPromptFiles) {
      const promptContent = readFileSync(promptPath, 'utf-8');

      const beginMarker = '<!-- BEGIN SHARED CONVENTIONS';
      const endMarker = '<!-- END SHARED CONVENTIONS -->';

      const beginIdx = promptContent.indexOf(beginMarker);
      const endIdx = promptContent.indexOf(endMarker);

      expect(beginIdx, `${name} prompt is missing BEGIN SHARED CONVENTIONS marker`).toBeGreaterThan(
        -1
      );
      expect(endIdx, `${name} prompt is missing END SHARED CONVENTIONS marker`).toBeGreaterThan(-1);

      // Extract content between the BEGIN marker line end and END marker start
      const afterBeginLine = promptContent.indexOf('\n', beginIdx);
      const embeddedContent = promptContent.slice(afterBeginLine + 1, endIdx).trim();
      const normalizedSource = sourceContent.trim();

      expect(
        normalize(embeddedContent),
        `${name} prompt shared conventions content has diverged from _shared_conventions.md`
      ).toBe(normalize(normalizedSource));
    }
  });
});

describe('architecture_review Active Context Directives (T008)', () => {
  const archPromptPath = join(repoRoot, 'config/prompts/architecture_review.md');

  it('architecture_review.md contains Active Context Directives section', () => {
    const content = readFileSync(archPromptPath, 'utf-8');
    expect(
      content.includes('### Active Context Directives'),
      'architecture_review.md missing Active Context Directives header'
    ).toBe(true);
  });

  it('architecture_review.md contains both Active Context Directive keywords', () => {
    const content = readFileSync(archPromptPath, 'utf-8');
    const directives = extractActiveContextDirectives(content);
    expect(
      directives,
      `architecture_review.md missing directives: expected 2, found [${directives.join(', ')}]`
    ).toHaveLength(2);
  });
});

describe('SHARED_CONVENTIONS_SUMMARY content validation (T008)', () => {
  it('summary contains key convention phrases', () => {
    const requiredPhrases = [
      'Existence verification',
      'TypeScript type-system trust',
      'MANDATORY',
      'Design intent awareness',
    ];

    for (const phrase of requiredPhrases) {
      expect(
        SHARED_CONVENTIONS_SUMMARY.includes(phrase),
        `SHARED_CONVENTIONS_SUMMARY is missing key phrase: "${phrase}"`
      ).toBe(true);
    }
  });

  it('summary contains convention numbers 7 through 12', () => {
    for (let i = 7; i <= 12; i++) {
      expect(
        SHARED_CONVENTIONS_SUMMARY.includes(`${i}.`),
        `SHARED_CONVENTIONS_SUMMARY is missing convention number ${i}`
      ).toBe(true);
    }
  });

  it('summary contains ACD directive references', () => {
    expect(
      SHARED_CONVENTIONS_SUMMARY.includes('Project Rules'),
      'SHARED_CONVENTIONS_SUMMARY missing Project Rules ACD reference'
    ).toBe(true);
    expect(
      SHARED_CONVENTIONS_SUMMARY.includes('PR Description'),
      'SHARED_CONVENTIONS_SUMMARY missing PR Description ACD reference'
    ).toBe(true);
  });
});
