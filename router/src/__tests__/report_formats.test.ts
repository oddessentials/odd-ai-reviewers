import { describe, it, expect } from 'vitest';
import {
  buildFingerprintMarker,
  extractFingerprintMarkers,
  getDedupeKey,
  generateAgentStatusTable,
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

describe('generateAgentStatusTable', () => {
  it('should generate table with ran agents', () => {
    const results = [
      { agentId: 'semgrep', success: true, findings: [{}, {}, {}], error: undefined },
      { agentId: 'reviewdog', success: true, findings: [{}, {}], error: undefined },
    ];
    const skipped: { id: string; name: string; reason: string }[] = [];

    const table = generateAgentStatusTable(results, skipped);

    expect(table).toContain('## Agent Status');
    expect(table).toContain('| 🛡 semgrep | ✅ Ran | 3 findings |');
    expect(table).toContain('| 🦊 reviewdog | ✅ Ran | 2 findings |');
  });

  it('should handle singular finding correctly', () => {
    const results = [{ agentId: 'opencode', success: true, findings: [{}], error: undefined }];

    const table = generateAgentStatusTable(results, []);

    expect(table).toContain('| 🧑‍💻 opencode | ✅ Ran | 1 finding |');
  });

  it('should show failed agents with error message', () => {
    const results = [
      { agentId: 'opencode', success: false, findings: [], error: 'API key not configured' },
    ];

    const table = generateAgentStatusTable(results, []);

    expect(table).toContain('| 🧑‍💻 opencode | ❌ Failed | API key not configured |');
  });

  it('should show skipped agents with reason', () => {
    const results = [{ agentId: 'semgrep', success: true, findings: [{}, {}], error: undefined }];
    const skipped = [
      { id: 'opencode', name: 'OpenCode', reason: 'CLI not installed' },
      { id: 'local_llm', name: 'Local LLM', reason: 'Ollama not reachable' },
    ];

    const table = generateAgentStatusTable(results, skipped);

    expect(table).toContain('| 🛡 semgrep | ✅ Ran | 2 findings |');
    expect(table).toContain('| 🧑‍💻 opencode | ⏭️ Skipped | CLI not installed |');
    expect(table).toContain('| 🧠 local_llm | ⏭️ Skipped | Ollama not reachable |');
  });

  it('should handle empty results and skipped', () => {
    const table = generateAgentStatusTable([], []);

    expect(table).toContain('## Agent Status');
    expect(table).toContain('| Agent | Status | Details |');
  });
});
