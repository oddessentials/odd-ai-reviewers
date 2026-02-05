/**
 * Base Report Module Tests
 *
 * Unit tests for groupAdjacentFindings.
 */

import { describe, it, expect } from 'vitest';
import { groupAdjacentFindings } from '../report/base.js';
import type { Finding } from '../agents/types.js';

function makeFinding(overrides: Partial<Finding> & { line: number }): Finding & { line: number } {
  return {
    severity: 'warning',
    file: 'src/app.ts',
    message: 'test finding',
    sourceAgent: 'test-agent',
    ...overrides,
  };
}

describe('groupAdjacentFindings', () => {
  it('should return an empty array for empty input', () => {
    expect(groupAdjacentFindings([])).toEqual([]);
  });

  it('should return a single finding unwrapped', () => {
    const f1 = makeFinding({ line: 10 });
    const result = groupAdjacentFindings([f1]);
    expect(result).toEqual([f1]);
  });

  it('should group two findings in the same file within 3 lines', () => {
    const f1 = makeFinding({ line: 10 });
    const f2 = makeFinding({ line: 12 });
    const result = groupAdjacentFindings([f1, f2]);
    expect(result).toEqual([[f1, f2]]);
  });

  it('should group findings exactly 3 lines apart', () => {
    const f1 = makeFinding({ line: 10 });
    const f2 = makeFinding({ line: 13 });
    const result = groupAdjacentFindings([f1, f2]);
    expect(result).toEqual([[f1, f2]]);
  });

  it('should not group findings 4 lines apart', () => {
    const f1 = makeFinding({ line: 10 });
    const f2 = makeFinding({ line: 14 });
    const result = groupAdjacentFindings([f1, f2]);
    expect(result).toEqual([f1, f2]);
  });

  it('should not group findings in different files even if lines are close', () => {
    const f1 = makeFinding({ file: 'src/a.ts', line: 10 });
    const f2 = makeFinding({ file: 'src/b.ts', line: 11 });
    const result = groupAdjacentFindings([f1, f2]);
    expect(result).toEqual([f1, f2]);
  });

  it('should group adjacent findings and keep distant ones separate', () => {
    const f1 = makeFinding({ line: 10 });
    const f2 = makeFinding({ line: 12 });
    const f3 = makeFinding({ line: 50 });
    const result = groupAdjacentFindings([f1, f2, f3]);
    expect(result).toEqual([[f1, f2], f3]);
  });

  it('should chain-group findings where each is within 3 lines of the previous', () => {
    const f1 = makeFinding({ line: 1 });
    const f2 = makeFinding({ line: 4 });
    const f3 = makeFinding({ line: 7 });
    const result = groupAdjacentFindings([f1, f2, f3]);
    expect(result).toEqual([[f1, f2, f3]]);
  });
});
