import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { matchFinding, type ExpectedFinding } from '../../src/benchmark/scoring.js';
import {
  runWithSnapshot,
  runLiveScenario,
  recordSnapshot,
  buildSnapshotMetadata,
  sha256,
  type RecordedResponse,
} from '../../src/benchmark/adapter.js';
import type { Finding } from '../../src/agents/types.js';
import {
  curatedGrafanaScenarios,
  type CuratedExternalBenchmarkScenario,
} from '../fixtures/benchmark/external-grafana-curated.js';

const snapshotDir = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'benchmark',
  'external-grafana-snapshots'
);
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
const RECORDING = process.env['RECORD'] === 'true';

function hasSnapshot(scenarioId: string): boolean {
  return existsSync(join(snapshotDir, `${scenarioId}.snapshot.json`));
}

async function runFromSnapshot(scenario: CuratedExternalBenchmarkScenario): Promise<Finding[]> {
  return runWithSnapshot(
    scenario.id,
    snapshotDir,
    currentSnapshotPromptHash,
    sha256(scenario.diff),
    scenario
  );
}

function assertRequiredFindingsMatched(
  scenario: CuratedExternalBenchmarkScenario,
  findings: Finding[]
): Finding[] {
  const unmatched: ExpectedFinding[] = [];
  const matchedIndexes = new Set<number>();

  for (const expected of scenario.expectedFindings) {
    let found = false;

    for (let i = 0; i < findings.length; i++) {
      if (matchedIndexes.has(i)) continue;
      const finding = findings[i];
      if (finding && matchFinding(expected, finding)) {
        matchedIndexes.add(i);
        found = true;
        break;
      }
    }

    if (!found) {
      unmatched.push(expected);
    }
  }

  expect(
    unmatched,
    `Missing required finding(s) for ${scenario.id}: ${JSON.stringify(unmatched)}`
  ).toHaveLength(0);

  return findings.filter((_, index) => !matchedIndexes.has(index));
}

function assertNoUnexpectedFindings(
  scenario: CuratedExternalBenchmarkScenario,
  unmatchedFindings: Finding[]
): void {
  const allowed = scenario.allowedAdditionalFindings ?? [];
  const unexpected = unmatchedFindings.filter(
    (finding) => !allowed.some((expected) => matchFinding(expected, finding))
  );

  expect(
    unexpected,
    `Unexpected extra finding(s) for ${scenario.id}: ${JSON.stringify(unexpected, null, 2)}`
  ).toHaveLength(0);
}

function assertForbiddenThemesAbsent(
  scenario: CuratedExternalBenchmarkScenario,
  findings: Finding[]
): void {
  const forbidden = scenario.forbiddenMessageSubstrings ?? [];
  if (forbidden.length === 0) {
    return;
  }

  const normalizedMessages = findings.map((finding) => finding.message.toLowerCase());
  const matches = forbidden.filter((substring) =>
    normalizedMessages.some((message) => message.includes(substring.toLowerCase()))
  );

  expect(
    matches,
    `Forbidden finding theme(s) present for ${scenario.id}: ${matches.join(', ')}`
  ).toEqual([]);
}

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

async function recordScenarioSnapshot(
  scenario: CuratedExternalBenchmarkScenario,
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
}

describe('External Benchmark Curated Regression Suite', () => {
  const recallScenarios = curatedGrafanaScenarios.filter((scenario) => scenario.mode === 'recall');
  const precisionScenarios = curatedGrafanaScenarios.filter(
    (scenario) => scenario.mode === 'precision'
  );

  it('contains the planned curated mix', () => {
    expect(recallScenarios).toHaveLength(3);
    expect(precisionScenarios).toHaveLength(2);
  });

  it.skipIf(RECORDING)('all curated scenarios have snapshots recorded', () => {
    const missing = curatedGrafanaScenarios.filter((scenario) => !hasSnapshot(scenario.id));
    expect(
      missing,
      `Missing curated benchmark snapshots: ${missing.map((scenario) => scenario.id).join(', ')}`
    ).toHaveLength(0);
  });

  it.skipIf(RECORDING)('all curated snapshots use one model for consistency', () => {
    const snapshotFiles = readdirSync(snapshotDir).filter((file) =>
      file.endsWith('.snapshot.json')
    );
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
      `Curated snapshots recorded with multiple models: ${[...modelIds].join(', ')}`
    ).toBe(1);
  });

  describe('Recall Recovery', () => {
    it
      .skipIf(RECORDING || recallScenarios.some((scenario) => !hasSnapshot(scenario.id)))
      .each(recallScenarios)(
      'recovers: $id',
      async (scenario) => {
        const findings = await runFromSnapshot(scenario);
        const unmatchedFindings = assertRequiredFindingsMatched(scenario, findings);
        assertNoUnexpectedFindings(scenario, unmatchedFindings);
        assertForbiddenThemesAbsent(scenario, findings);
      },
      30_000
    );
  });

  describe('Precision Recovery', () => {
    it
      .skipIf(RECORDING || precisionScenarios.some((scenario) => !hasSnapshot(scenario.id)))
      .each(precisionScenarios)(
      'keeps true positives while dropping noise: $id',
      async (scenario) => {
        const findings = await runFromSnapshot(scenario);
        const unmatchedFindings = assertRequiredFindingsMatched(scenario, findings);
        assertNoUnexpectedFindings(scenario, unmatchedFindings);
        assertForbiddenThemesAbsent(scenario, findings);
      },
      30_000
    );
  });

  describe.runIf(RECORDING)('Snapshot Recording', () => {
    it.each(curatedGrafanaScenarios)(
      'records: $id',
      async (scenario) => {
        const response = await runLiveScenario(scenario);
        await recordScenarioSnapshot(
          scenario,
          response.findings,
          response.rawOutput,
          response.modelId,
          response.provider
        );
        expect(true).toBe(true);
      },
      120_000
    );
  });
});
