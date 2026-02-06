import { describe, it, expect } from 'vitest';
import { shouldSuppressInlineComments, type DriftSignal } from '../report/line-resolver.js';
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
