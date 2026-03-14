/**
 * False Positive Regression Benchmark Test Suite
 *
 * Validates the dual-pool benchmark scoring (FP suppression + TP preservation)
 * using deterministic analysis (safe-source detection, finding-validator)
 * and snapshot replay for LLM-dependent patterns.
 *
 * Patterns A and E are deterministic and run via AST analysis.
 * Patterns B/C/D/F use snapshot replay (pre-recorded LLM responses).
 * TP scenarios test the VulnerabilityDetector directly.
 *
 * IMPORTANT: All snapshots must be recorded with the same model for consistency.
 * Set BENCHMARK_MODEL_ID and BENCHMARK_PROVIDER in .env before running
 * `pnpm benchmark:record`. See .env.example for defaults.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { BenchmarkScenario } from '../../src/benchmark/scoring.js';
import {
  scoreScenario,
  computeReport,
  matchFinding,
  matchFindings,
} from '../../src/benchmark/scoring.js';
import {
  runScenario,
  parseDiffFiles,
  getUnsupportedScenarioReason,
  runWithSnapshot,
  recordSnapshot,
  buildSnapshotMetadata,
  sha256,
} from '../../src/benchmark/adapter.js';
import type { RecordedResponse } from '../../src/benchmark/adapter.js';
import type { Finding } from '../../src/agents/types.js';

// =============================================================================
// Load Fixtures
// =============================================================================

const fixturePath = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'benchmark',
  'regression-suite.json'
);
const suiteData = JSON.parse(readFileSync(fixturePath, 'utf-8'));
const scenarios: BenchmarkScenario[] = suiteData.scenarios;

// Split by pool
const fpScenarios = scenarios.filter((s) => !s.truePositive);
const tpScenarios = scenarios.filter((s) => s.truePositive);

// Split FP by pattern
const patternA = fpScenarios.filter((s) => s.pattern === 'A');
const patternB = fpScenarios.filter((s) => s.pattern === 'B');
const patternC = fpScenarios.filter((s) => s.pattern === 'C');
const patternD = fpScenarios.filter((s) => s.pattern === 'D');
const patternE = fpScenarios.filter((s) => s.pattern === 'E');
const patternF = fpScenarios.filter((s) => s.pattern === 'F');

// Split TP by category
const injectionTP = tpScenarios.filter((s) => s.category === 'injection');
const xssTP = tpScenarios.filter((s) => s.category === 'xss');
const pathTP = tpScenarios.filter((s) => s.category === 'path_traversal');
const ssrfTP = tpScenarios.filter((s) => s.category === 'ssrf');
const authTP = tpScenarios.filter((s) => s.category === 'auth_bypass');

// Snapshot-based TP scenarios (e.g., fp-d-006 reclassified as TP, B6 remediation)
const snapshotTP = tpScenarios.filter(
  (s) => s.pattern === 'B' || s.pattern === 'C' || s.pattern === 'D' || s.pattern === 'F'
);

// =============================================================================
// Snapshot Replay
// =============================================================================

const snapshotDir = join(import.meta.dirname, '..', 'fixtures', 'benchmark', 'snapshots');
const routerRoot = join(import.meta.dirname, '..', '..');
const snapshotPromptSources = [
  join(routerRoot, 'src', 'agents', 'ai_semantic_review.ts'),
  join(routerRoot, 'src', 'agents', 'opencode.ts'),
  join(routerRoot, 'src', 'agents', 'pr_agent.ts'),
  join(routerRoot, '..', 'config', 'prompts', 'semantic_review.md'),
  join(routerRoot, '..', 'config', 'prompts', 'opencode_system.md'),
  join(routerRoot, '..', 'config', 'prompts', 'pr_agent_review.md'),
  join(routerRoot, '..', 'config', 'prompts', 'architecture_review.md'),
];
const currentSnapshotPromptHash = sha256(
  snapshotPromptSources.map((filePath) => readFileSync(filePath, 'utf-8')).join('\n---FILE---\n')
);

/**
 * Check if a scenario has a recorded snapshot available.
 */
function hasSnapshot(scenarioId: string): boolean {
  return existsSync(join(snapshotDir, `${scenarioId}.snapshot.json`));
}

/**
 * Run a scenario using snapshot replay. Returns findings from the recorded snapshot.
 * Throws if no snapshot exists.
 */
async function runFromSnapshot(scenario: BenchmarkScenario): Promise<Finding[]> {
  return runWithSnapshot(
    scenario.id,
    snapshotDir,
    currentSnapshotPromptHash,
    sha256(scenario.diff),
    scenario
  );
}

/** Whether snapshot recording mode is active (set via RECORD=true env var). */
const RECORDING = process.env['RECORD'] === 'true';

// When recording, load API keys from root .env (if present and not already set).
// CI provides keys via secrets; local dev uses .env. Keys already in the
// environment (e.g. from CI secrets) are never overwritten.
if (RECORDING) {
  const envFile = join(import.meta.dirname, '..', '..', '..', '.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim();
      }
    }
  }
}

/**
 * Record a snapshot for a scenario after a live LLM run.
 * Called only when RECORD=true. The caller provides the findings
 * obtained from a live LLM invocation.
 */
async function recordScenarioSnapshot(
  scenario: BenchmarkScenario,
  findings: Finding[],
  rawOutput: string,
  modelId?: string,
  provider?: string
): Promise<void> {
  const response: RecordedResponse = { findings, rawOutput };
  const metadata = buildSnapshotMetadata(
    currentSnapshotPromptHash,
    sha256(scenario.diff),
    modelId,
    provider
  );
  await recordSnapshot(scenario.id, response, metadata, snapshotDir);
  console.log(`[benchmark:record] Recorded snapshot for ${scenario.id}`);
}

// Filter patterns B/C/D/F to only those with available snapshots
const patternBWithSnapshots = patternB.filter((s) => hasSnapshot(s.id));
const patternCWithSnapshots = patternC.filter((s) => hasSnapshot(s.id));
const patternDWithSnapshots = patternD.filter((s) => hasSnapshot(s.id));
const patternFWithSnapshots = patternF.filter((s) => hasSnapshot(s.id));
const snapshotTPWithSnapshots = snapshotTP.filter((s) => hasSnapshot(s.id));

// =============================================================================
// Scoring Unit Tests
// =============================================================================

describe('Scoring Module', () => {
  it('matchFinding requires file match', () => {
    expect(
      matchFinding(
        { file: 'a.ts' },
        { file: 'b.ts', severity: 'warning', message: '', sourceAgent: 'test' }
      )
    ).toBe(false);
    expect(
      matchFinding(
        { file: 'a.ts' },
        { file: 'a.ts', severity: 'warning', message: '', sourceAgent: 'test' }
      )
    ).toBe(true);
  });

  it('matchFinding checks severity ranking', () => {
    expect(
      matchFinding(
        { file: 'a.ts', severityAtLeast: 'warning' },
        { file: 'a.ts', severity: 'info', message: '', sourceAgent: 'test' }
      )
    ).toBe(false);
    expect(
      matchFinding(
        { file: 'a.ts', severityAtLeast: 'warning' },
        { file: 'a.ts', severity: 'error', message: '', sourceAgent: 'test' }
      )
    ).toBe(true);
  });

  it('matchFinding checks messageContains case-insensitively', () => {
    expect(
      matchFinding(
        { file: 'a.ts', messageContains: 'injection' },
        {
          file: 'a.ts',
          severity: 'warning',
          message: 'SQL Injection detected',
          sourceAgent: 'test',
        }
      )
    ).toBe(true);
  });

  it('matchFindings performs 1:1 matching', () => {
    const expected = [{ file: 'a.ts', messageContains: 'xss' }, { file: 'b.ts' }];
    const actual = [
      { file: 'a.ts', severity: 'warning' as const, message: 'XSS risk', sourceAgent: 'test' },
      { file: 'b.ts', severity: 'info' as const, message: 'Minor', sourceAgent: 'test' },
      { file: 'c.ts', severity: 'info' as const, message: 'Extra', sourceAgent: 'test' },
    ];
    const result = matchFindings(expected, actual);
    expect(result.matched).toBe(2);
    expect(result.unmatchedExpected).toHaveLength(0);
    expect(result.extraneous).toHaveLength(1);
  });

  it('scoreScenario scores FP scenario correctly', () => {
    const scenario: BenchmarkScenario = {
      id: 'test-fp',
      category: 'test',
      pattern: 'A',
      description: 'Test',
      sourceIssue: '#0',
      diff: '',
      expectedFindings: [],
      truePositive: false,
    };
    const resultPass = scoreScenario(scenario, []);
    expect(resultPass.passed).toBe(true);

    const resultFail = scoreScenario(scenario, [
      { file: 'x.ts', severity: 'warning', message: 'oops', sourceAgent: 'test' },
    ]);
    expect(resultFail.passed).toBe(false);
  });

  it('scoreScenario scores TP scenario correctly', () => {
    const scenario: BenchmarkScenario = {
      id: 'test-tp',
      category: 'test',
      pattern: 'A',
      description: 'Test',
      sourceIssue: '#0',
      diff: '',
      expectedFindings: [{ file: 'a.ts', messageContains: 'vuln' }],
      truePositive: true,
    };
    const resultPass = scoreScenario(scenario, [
      { file: 'a.ts', severity: 'warning', message: 'vulnerability found', sourceAgent: 'test' },
    ]);
    expect(resultPass.passed).toBe(true);

    const resultFail = scoreScenario(scenario, []);
    expect(resultFail.passed).toBe(false);
  });

  it('computeReport computes dual-pool metrics', () => {
    const fpResult = scoreScenario(
      {
        id: 'fp-1',
        category: 'safe-source',
        pattern: 'A',
        description: '',
        sourceIssue: '',
        diff: '',
        expectedFindings: [],
        truePositive: false,
      },
      []
    );
    const tpResult = scoreScenario(
      {
        id: 'tp-1',
        category: 'injection',
        pattern: 'A',
        description: '',
        sourceIssue: '',
        diff: '',
        expectedFindings: [{ file: 'a.ts' }],
        truePositive: true,
      },
      [{ file: 'a.ts', severity: 'warning', message: '', sourceAgent: 'test' }]
    );

    const report = computeReport([fpResult, tpResult]);
    expect(report.pool1.suppressionRate).toBe(1);
    expect(report.pool2.recall).toBe(1);
    expect(report.totalScenarios).toBe(2);
  });
});

// =============================================================================
// Adapter Unit Tests
// =============================================================================

describe('Benchmark Adapter', () => {
  it('parseDiffFiles extracts files from unified diff', () => {
    const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,3 +1,5 @@
+function hello() {
+  return 'world';
+}
+
 export function test() {}`;

    const files = parseDiffFiles(diff);
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('src/test.ts');
    expect(files[0]?.content).toContain('function hello()');
  });

  it('parseDiffFiles handles multiple files', () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
+const x = 1;
 export function a() {}
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,2 +1,3 @@
+const y = 2;
 export function b() {}`;

    const files = parseDiffFiles(diff);
    expect(files).toHaveLength(2);
    expect(files[0]?.path).toBe('src/a.ts');
    expect(files[1]?.path).toBe('src/b.ts');
  });

  it('rejects LLM-dependent scenarios instead of silently scoring them', async () => {
    const scenario = patternB[0];
    expect(scenario).toBeDefined();
    if (!scenario) {
      throw new Error('Expected at least one Pattern B scenario in the fixture suite');
    }
    expect(getUnsupportedScenarioReason(scenario)).toContain('mocked LLM behavior');
    await expect(runScenario(scenario)).rejects.toThrow(
      `Scenario ${scenario.id} is unsupported by the deterministic benchmark adapter`
    );
  });

  it('rejects snapshot replay when fixture content drifts (FR-022)', async () => {
    const scenario = patternBWithSnapshots[0];
    expect(scenario).toBeDefined();
    if (!scenario) {
      throw new Error('Expected at least one snapshot-backed Pattern B scenario');
    }

    await expect(
      runWithSnapshot(
        scenario.id,
        snapshotDir,
        currentSnapshotPromptHash,
        sha256(`${scenario.diff}\n`)
      )
    ).rejects.toThrow(`Fixture content changed for scenario "${scenario.id}"`);
  });

  it('rejects snapshot replay when prompt template drifts (FR-022)', async () => {
    const scenario = patternBWithSnapshots[0];
    expect(scenario).toBeDefined();
    if (!scenario) {
      throw new Error('Expected at least one snapshot-backed Pattern B scenario');
    }

    await expect(
      runWithSnapshot(
        scenario.id,
        snapshotDir,
        sha256(`${currentSnapshotPromptHash}:drift`),
        sha256(scenario.diff)
      )
    ).rejects.toThrow(`Prompt template changed for scenario "${scenario.id}"`);
  });
});

// =============================================================================
// Fixture Validation
// =============================================================================

describe('Fixture Validation', () => {
  it('has correct total fixture count (66+)', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(66);
  });

  it('has 55 FP fixtures', () => {
    expect(fpScenarios.length).toBe(55);
  });

  it('has 10+ TP fixtures', () => {
    expect(tpScenarios.length).toBeGreaterThanOrEqual(10);
  });

  it('has 12 Pattern A fixtures', () => {
    expect(patternA.length).toBe(12);
  });

  it('has 7 Pattern B fixtures', () => {
    expect(patternB.length).toBe(7);
  });

  it('has 6 Pattern C fixtures', () => {
    expect(patternC.length).toBe(6);
  });

  it('has 6 Pattern D fixtures', () => {
    expect(patternD.length).toBe(6);
  });

  it('has 7 Pattern E fixtures', () => {
    expect(patternE.length).toBe(7);
  });

  it('has 17 Pattern F fixtures', () => {
    expect(patternF.length).toBe(17);
  });

  it('all FP fixtures have truePositive: false', () => {
    for (const s of fpScenarios) {
      expect(s.truePositive).toBe(false);
    }
  });

  it('all TP fixtures have truePositive: true and non-empty expectedFindings', () => {
    for (const s of tpScenarios) {
      expect(s.truePositive).toBe(true);
      expect(s.expectedFindings.length).toBeGreaterThan(0);
    }
  });

  it('all scenarios have unique IDs', () => {
    const ids = scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all Pattern F fixtures have subcategory', () => {
    for (const s of patternF) {
      expect(s.subcategory).toBeDefined();
      expect(typeof s.subcategory === 'string' && s.subcategory.length > 0).toBe(true);
    }
  });

  it('all scenarios have parseable diffs', () => {
    for (const s of scenarios) {
      const files = parseDiffFiles(s.diff);
      expect(files.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('all snapshots use the same modelId (model consistency)', () => {
    const snapshotFiles = readdirSync(snapshotDir).filter((f) => f.endsWith('.snapshot.json'));
    expect(snapshotFiles.length).toBeGreaterThan(0);
    const modelIds = new Set<string>();
    for (const file of snapshotFiles) {
      const snapshot = JSON.parse(readFileSync(join(snapshotDir, file), 'utf-8')) as {
        metadata: { modelId: string };
      };
      modelIds.add(snapshot.metadata.modelId);
    }
    expect(
      modelIds.size,
      `Snapshots recorded with multiple models: ${[...modelIds].join(', ')}. ` +
        `Re-record all snapshots with a single model using: pnpm benchmark:record`
    ).toBe(1);
  });
});

// =============================================================================
// Pool 1: FP Suppression
// =============================================================================

describe('False Positive Regression Suite', () => {
  describe('Pool 1: FP Suppression', () => {
    describe('Pattern A: Safe Sources', () => {
      it.each(patternA)(
        'should not flag: $description',
        async (scenario) => {
          const findings = await runScenario(scenario);
          expect(findings).toHaveLength(0);
        },
        15_000
      );
    });

    // Pattern B uses snapshot replay for framework convention detection
    describe('Pattern B: Framework Conventions (snapshot replay)', () => {
      it.skipIf(patternBWithSnapshots.length === 0).each(patternBWithSnapshots)(
        'should not flag: $description',
        async (scenario) => {
          const findings = await runFromSnapshot(scenario);
          expect(findings).toHaveLength(0);
        },
        15_000
      );
    });

    // Pattern C uses snapshot replay for project context understanding
    describe('Pattern C: Project Context (snapshot replay)', () => {
      it.skipIf(patternCWithSnapshots.length === 0).each(patternCWithSnapshots)(
        'should not flag: $description',
        async (scenario) => {
          const findings = await runFromSnapshot(scenario);
          expect(findings).toHaveLength(0);
        },
        15_000
      );
    });

    // Pattern D uses snapshot replay for PR description analysis
    describe('Pattern D: PR Description (snapshot replay)', () => {
      it.skipIf(patternDWithSnapshots.length === 0).each(patternDWithSnapshots)(
        'should not flag: $description',
        async (scenario) => {
          const findings = await runFromSnapshot(scenario);
          expect(findings).toHaveLength(0);
        },
        15_000
      );
    });

    describe('Pattern E: Self-Contradicting', () => {
      it.each(patternE)(
        'should filter: $description',
        async (scenario) => {
          // Pattern E tests the finding-validator which filters
          // self-contradicting findings and invalid line numbers.
          // These scenarios should produce zero findings after validation.
          const findings = await runScenario(scenario);
          expect(findings).toHaveLength(0);
        },
        15_000
      );
    });

    // Pattern F uses snapshot replay for mixed/LLM-dependent scenarios
    describe('Pattern F: Mixed (snapshot replay)', () => {
      it.skipIf(patternFWithSnapshots.length === 0).each(patternFWithSnapshots)(
        'should not flag: $description',
        async (scenario) => {
          const findings = await runFromSnapshot(scenario);
          expect(findings).toHaveLength(0);
        },
        15_000
      );
    });
  });

  // ===========================================================================
  // Pool 2: TP Preservation
  // ===========================================================================

  describe('Pool 2: TP Preservation', () => {
    describe('Injection', () => {
      it.each(injectionTP)(
        'should detect: $description',
        async (scenario) => {
          const findings = await runScenario(scenario);
          const result = scoreScenario(scenario, findings);
          expect(result.passed).toBe(true);
          expect(result.matchedCount).toBeGreaterThanOrEqual(1);
        },
        15_000
      );
    });

    describe('XSS', () => {
      it.each(xssTP)(
        'should detect: $description',
        async (scenario) => {
          const findings = await runScenario(scenario);
          const result = scoreScenario(scenario, findings);
          expect(result.passed).toBe(true);
          expect(result.matchedCount).toBeGreaterThanOrEqual(1);
        },
        15_000
      );
    });

    describe('Path Traversal', () => {
      it.each(pathTP)(
        'should detect: $description',
        async (scenario) => {
          const findings = await runScenario(scenario);
          const result = scoreScenario(scenario, findings);
          expect(result.passed).toBe(true);
          expect(result.matchedCount).toBeGreaterThanOrEqual(1);
        },
        15_000
      );
    });

    describe('SSRF', () => {
      it.each(ssrfTP)(
        'should detect: $description',
        async (scenario) => {
          const findings = await runScenario(scenario);
          const result = scoreScenario(scenario, findings);
          expect(result.passed).toBe(true);
          expect(result.matchedCount).toBeGreaterThanOrEqual(1);
        },
        15_000
      );
    });

    describe('Auth Bypass', () => {
      it.each(authTP)(
        'should detect: $description',
        async (scenario) => {
          const findings = await runScenario(scenario);
          const result = scoreScenario(scenario, findings);
          expect(result.passed).toBe(true);
          expect(result.matchedCount).toBeGreaterThanOrEqual(1);
        },
        15_000
      );
    });

    // B6 remediation: Snapshot-based TP scenarios (e.g., fp-d-006 reclassified as TP)
    describe('Snapshot-based TP (snapshot replay)', () => {
      it.skipIf(snapshotTPWithSnapshots.length === 0).each(snapshotTPWithSnapshots)(
        'should detect: $description',
        async (scenario) => {
          const findings = await runFromSnapshot(scenario);
          const result = scoreScenario(scenario, findings);
          expect(result.passed).toBe(true);
          expect(result.matchedCount).toBeGreaterThanOrEqual(1);
        },
        15_000
      );
    });
  });

  // ===========================================================================
  // Release Gate Metrics
  // ===========================================================================

  describe('Release Gate Metrics', () => {
    // Deterministic (AST-based) + snapshot-replayed FP scenarios
    const allRunnableFP = [
      ...patternA,
      ...patternE,
      ...patternBWithSnapshots,
      ...patternCWithSnapshots,
      ...patternDWithSnapshots,
      ...patternFWithSnapshots,
    ];
    // Deterministic TPs use runScenario() (AST analysis); snapshot TPs use runFromSnapshot()
    const deterministicTP = tpScenarios.filter(
      (s) => s.pattern !== 'B' && s.pattern !== 'C' && s.pattern !== 'D' && s.pattern !== 'F'
    );

    /** Run an FP scenario — uses AST for A/E, snapshot for B/C/D/F */
    async function runFPScenario(scenario: BenchmarkScenario): Promise<Finding[]> {
      if (scenario.pattern === 'A' || scenario.pattern === 'E') {
        return runScenario(scenario);
      }
      return runFromSnapshot(scenario);
    }

    it('Runnable scenario ratio >= 80% (prevents vacuous gate)', () => {
      const runnableCount =
        allRunnableFP.length + deterministicTP.length + snapshotTPWithSnapshots.length;
      const totalCount = fpScenarios.length + tpScenarios.length;
      const ratio = runnableCount / totalCount;
      expect(
        ratio,
        `Only ${runnableCount}/${totalCount} scenarios (${(ratio * 100).toFixed(1)}%) are runnable. ` +
          `Record snapshots with 'pnpm benchmark:record' to increase coverage.`
      ).toBeGreaterThanOrEqual(0.8);
    });

    // SC-001: Per-scenario gate — each of 11 targeted FP scenarios individually must produce 0 findings
    const TARGETED_SCENARIO_IDS = new Set([
      'fp-b-001',
      'fp-b-003',
      'fp-b-006',
      'fp-b-007',
      'fp-c-005',
      'fp-c-006',
      'fp-f-005',
      'fp-f-007',
      'fp-f-010',
      'fp-f-014',
      'fp-f-015',
    ]);

    it('SC-001: Per-scenario gate — all 11 targeted scenarios individually = 0 findings', async () => {
      const failures: { id: string; count: number }[] = [];
      for (const scenario of allRunnableFP) {
        if (!TARGETED_SCENARIO_IDS.has(scenario.id)) continue;
        const findings = await runFPScenario(scenario);
        if (findings.length > 0) {
          failures.push({ id: scenario.id, count: findings.length });
        }
      }
      expect(
        failures,
        `${failures.length} targeted scenario(s) still have surviving findings:\n` +
          failures.map((f) => `  ${f.id}: ${f.count} finding(s)`).join('\n')
      ).toHaveLength(0);
    }, 120_000);

    // SC-004: Aggregate non-regression floor (relationship to SC-001: SC-001 gates individual
    // targeted scenarios; SC-004 ensures the overall suppression rate doesn't regress)
    it('SC-004: Aggregate FP suppression rate >= 90% (non-regression floor)', async () => {
      const results = [];
      for (const scenario of allRunnableFP) {
        const findings = await runFPScenario(scenario);
        results.push(scoreScenario(scenario, findings));
      }
      const report = computeReport(results);
      expect(report.pool1.suppressionRate).toBeGreaterThanOrEqual(0.9);
    }, 120_000);

    it('SC-002: TP recall = 100%', async () => {
      const results = [];
      // Deterministic TP scenarios
      for (const scenario of deterministicTP) {
        const findings = await runScenario(scenario);
        results.push(scoreScenario(scenario, findings));
      }
      // Snapshot-based TP scenarios (B6 remediation)
      for (const scenario of snapshotTPWithSnapshots) {
        const findings = await runFromSnapshot(scenario);
        results.push(scoreScenario(scenario, findings));
      }
      const report = computeReport(results);
      expect(report.pool2.recall).toBe(1.0);
    }, 120_000);

    it('SC-003: TP precision >= 70%', async () => {
      const results = [];
      for (const scenario of deterministicTP) {
        const findings = await runScenario(scenario);
        results.push(scoreScenario(scenario, findings));
      }
      for (const scenario of snapshotTPWithSnapshots) {
        const findings = await runFromSnapshot(scenario);
        results.push(scoreScenario(scenario, findings));
      }
      const report = computeReport(results);
      expect(report.pool2.precision).toBeGreaterThanOrEqual(0.7);
    }, 120_000);

    it('SC-007: Self-contradiction filter >= 80% on Pattern E', async () => {
      const results = [];
      for (const scenario of patternE) {
        const findings = await runScenario(scenario);
        results.push(scoreScenario(scenario, findings));
      }
      const passed = results.filter((r) => r.passed).length;
      const rate = passed / results.length;
      expect(rate).toBeGreaterThanOrEqual(0.8);
    }, 60_000);
  });

  // ===========================================================================
  // Snapshot Recording (RECORD=true)
  // ===========================================================================

  describe.runIf(RECORDING)('Snapshot Recording', () => {
    const snapshotScenarios = [...patternB, ...patternC, ...patternD, ...patternF, ...snapshotTP];

    it.each(snapshotScenarios)(
      'record snapshot: $id — $description',
      async (scenario) => {
        const { runLiveScenario } = await import('../../src/benchmark/adapter.js');
        const response = await runLiveScenario(scenario);
        await recordScenarioSnapshot(
          scenario,
          response.findings,
          response.rawOutput,
          response.modelId,
          response.provider
        );
        // Recording always passes — we just need to capture the snapshot
        expect(true).toBe(true);
      },
      120_000
    );
  });
});
