import { describe, it, expect } from 'vitest';
import {
  buildFingerprintMarker,
  extractFingerprintMarkers,
  getDedupeKey,
} from '../report/formats.js';
import type { Finding } from '../agents/index.js';

describe('Report format fingerprint markers', () => {
  it('should embed and extract canonical fingerprint markers', () => {
    const finding: Finding = {
      severity: 'error',
      file: 'src/auth.ts',
      line: 10,
      message: 'Hardcoded secret',
      ruleId: 'security/hardcoded-secret',
      sourceAgent: 'semgrep',
    };

    const marker = buildFingerprintMarker(finding);
    const body = `Issue found\n\n${marker}`;

    expect(marker).toContain(getDedupeKey(finding));
    expect(extractFingerprintMarkers(body)).toEqual([getDedupeKey(finding)]);
  });

  it('should extract multiple markers from grouped comments', () => {
    const findingA: Finding = {
      severity: 'warning',
      file: 'src/a.ts',
      line: 1,
      message: 'Issue A',
      sourceAgent: 'reviewdog',
    };
    const findingB: Finding = {
      severity: 'warning',
      file: 'src/a.ts',
      line: 2,
      message: 'Issue B',
      sourceAgent: 'reviewdog',
    };

    const body = [
      buildFingerprintMarker(findingA),
      buildFingerprintMarker(findingB),
      'Additional text',
    ].join('\n');

    expect(extractFingerprintMarkers(body)).toEqual([
      getDedupeKey(findingA),
      getDedupeKey(findingB),
    ]);
  });
});
