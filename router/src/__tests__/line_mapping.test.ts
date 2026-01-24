import { describe, it, expect } from 'vitest';
import type { DiffFile } from '../diff.js';
import type { Finding } from '../agents/index.js';
import { buildLineResolver, normalizeFindingsForDiff } from '../report/line-mapping.js';

describe('Line mapping', () => {
  const patch = [
    'diff --git a/src/test.ts b/src/test.ts',
    'index 1234567..89abcde 100644',
    '--- a/src/test.ts',
    '+++ b/src/test.ts',
    '@@ -1,3 +1,4 @@',
    '-const a = 1;',
    '+const a = 1;',
    '+const b = 2;',
    ' const c = 3;',
  ].join('\n');

  const diffFiles: DiffFile[] = [
    {
      path: 'src/test.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      patch,
    },
  ];

  it('resolves file line numbers directly when present in diff', () => {
    const resolver = buildLineResolver(diffFiles);
    expect(resolver.resolveLine('src/test.ts', 2, 'semgrep')).toBe(2);
  });

  it('resolves diff line numbers to file line numbers', () => {
    const resolver = buildLineResolver(diffFiles);
    expect(resolver.resolveLine('src/test.ts', 3, 'pr_agent')).toBe(2);
  });

  it('drops unresolved lines during normalization', () => {
    const resolver = buildLineResolver(diffFiles);
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/test.ts',
        line: 99,
        message: 'Out of range',
        sourceAgent: 'semgrep',
      },
    ];

    const normalized = normalizeFindingsForDiff(findings, resolver);
    expect(normalized[0]?.line).toBeUndefined();
  });
});
