import { describe, it, expect } from 'vitest';
import {
  shouldSuppressInlineComments,
  computeInlineDriftSignal,
  computeDriftSignal,
  type DriftSignal,
  type ValidationStats,
} from '../report/line-resolver.js';
import { GatingSchema } from '../config/schemas.js';

describe('shouldSuppressInlineComments', () => {
  const makeDrift = (level: 'ok' | 'warn' | 'fail', degradation: number): DriftSignal => ({
    level,
    degradationPercent: degradation,
    autoFixPercent: 0,
    message: `Test signal at ${level}`,
    samples: [],
  });

  it('returns false when drift_gate is disabled (default off)', () => {
    const drift = makeDrift('fail', 60);
    expect(shouldSuppressInlineComments(drift, false)).toBe(false);
  });

  it('returns false at ok level even with drift_gate enabled', () => {
    const drift = makeDrift('ok', 5);
    expect(shouldSuppressInlineComments(drift, true)).toBe(false);
  });

  it('returns false at warn level even with drift_gate enabled', () => {
    const drift = makeDrift('warn', 25.6);
    expect(shouldSuppressInlineComments(drift, true)).toBe(false);
  });

  it('returns true at fail level when drift_gate is enabled', () => {
    const drift = makeDrift('fail', 55);
    expect(shouldSuppressInlineComments(drift, true)).toBe(true);
  });

  it('returns false for undefined drift signal', () => {
    expect(shouldSuppressInlineComments(undefined, true)).toBe(false);
  });

  it('returns false when both signal is undefined and gate is disabled', () => {
    expect(shouldSuppressInlineComments(undefined, false)).toBe(false);
  });
});

describe('computeInlineDriftSignal', () => {
  const baseStats: ValidationStats = {
    total: 0,
    valid: 0,
    normalized: 0,
    downgraded: 0,
    dropped: 0,
    deletedFiles: 0,
    ambiguousRenames: 0,
    remappedPaths: 0,
    inlineTotal: 0,
    inlineDowngraded: 0,
  };

  it('returns ok when no inline findings exist', () => {
    const stats: ValidationStats = {
      ...baseStats,
      total: 10,
      valid: 10,
      inlineTotal: 0,
      inlineDowngraded: 0,
    };
    const signal = computeInlineDriftSignal(stats, []);
    expect(signal.level).toBe('ok');
    expect(signal.degradationPercent).toBe(0);
  });

  it('detects fail-level inline degradation diluted by file-level findings', () => {
    // The exact scenario from the bug report:
    // 2 invalid inline findings + 10 file-level findings
    // Overall: 2/12 = 16.7% (below fail threshold)
    // Inline: 2/2 = 100% (above fail threshold)
    const stats: ValidationStats = {
      ...baseStats,
      total: 12,
      valid: 10, // 10 file-level findings valid
      downgraded: 2, // 2 inline findings downgraded
      inlineTotal: 2, // only 2 findings had lines
      inlineDowngraded: 2, // both were invalid
    };

    const overallSignal = computeDriftSignal(stats, []);
    const inlineSignal = computeInlineDriftSignal(stats, []);

    // Overall is diluted below fail threshold
    expect(overallSignal.level).toBe('ok');
    expect(overallSignal.degradationPercent).toBeLessThan(50);

    // Inline correctly detects 100% degradation
    expect(inlineSignal.level).toBe('fail');
    expect(inlineSignal.degradationPercent).toBe(100);
  });

  it('returns ok when all inline findings are valid', () => {
    const stats: ValidationStats = {
      ...baseStats,
      total: 15,
      valid: 15,
      inlineTotal: 5,
      inlineDowngraded: 0,
    };
    const signal = computeInlineDriftSignal(stats, []);
    expect(signal.level).toBe('ok');
    expect(signal.degradationPercent).toBe(0);
  });

  it('returns warn at 25% inline degradation', () => {
    const stats: ValidationStats = {
      ...baseStats,
      total: 20,
      valid: 15,
      downgraded: 5,
      inlineTotal: 4,
      inlineDowngraded: 1, // 25% of inline findings degraded
    };
    const signal = computeInlineDriftSignal(stats, []);
    expect(signal.level).toBe('warn');
    expect(signal.degradationPercent).toBe(25);
  });

  it('returns fail at 50% inline degradation', () => {
    const stats: ValidationStats = {
      ...baseStats,
      total: 20,
      valid: 14,
      downgraded: 6,
      inlineTotal: 6,
      inlineDowngraded: 3, // 50% of inline findings degraded
    };
    const signal = computeInlineDriftSignal(stats, []);
    expect(signal.level).toBe('fail');
    expect(signal.degradationPercent).toBe(50);
  });
});

describe('GatingSchema drift_gate', () => {
  it('accepts drift_gate: true', () => {
    const result = GatingSchema.parse({
      enabled: false,
      fail_on_severity: 'error',
      drift_gate: true,
    });
    expect(result.drift_gate).toBe(true);
  });

  it('accepts drift_gate: false', () => {
    const result = GatingSchema.parse({
      enabled: false,
      fail_on_severity: 'error',
      drift_gate: false,
    });
    expect(result.drift_gate).toBe(false);
  });

  it('defaults drift_gate to false when omitted', () => {
    const result = GatingSchema.parse({
      enabled: false,
      fail_on_severity: 'error',
    });
    expect(result.drift_gate).toBe(false);
  });

  it('rejects non-boolean drift_gate', () => {
    expect(() =>
      GatingSchema.parse({
        enabled: false,
        fail_on_severity: 'error',
        drift_gate: 'yes',
      })
    ).toThrow();
  });
});
