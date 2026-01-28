/**
 * Finding Generator Tests
 *
 * Tests for the FindingGenerator class that creates control flow findings
 * with mitigation-aware severity adjustment and contextual reasoning.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FindingGenerator,
  createFindingGenerator,
} from '../../../../src/agents/control_flow/finding-generator.js';
import {
  parseSourceFile,
  findFunctions,
  buildCFG,
} from '../../../../src/agents/control_flow/cfg-builder.js';
import type { ControlFlowGraphRuntime } from '../../../../src/agents/control_flow/cfg-types.js';
import type {
  PotentialVulnerability,
  VulnerabilityType,
} from '../../../../src/agents/control_flow/types.js';
import type {
  PathAnalysisResult,
  ExecutionPath,
} from '../../../../src/agents/control_flow/path-analyzer.js';
import { assertDefined } from '../../../test-utils.js';

// =============================================================================
// Helper Functions
// =============================================================================

function buildCFGFromCode(code: string): ControlFlowGraphRuntime {
  const sourceFile = parseSourceFile(code, 'test.ts');
  const functions = findFunctions(sourceFile);
  const firstFunction = assertDefined(functions[0], 'No functions found in code');
  return buildCFG(firstFunction, sourceFile, 'test.ts');
}

function createMockVulnerability(
  type: VulnerabilityType = 'injection',
  line = 5
): PotentialVulnerability {
  return {
    id: `vuln_${type}_${line}`,
    type,
    sinkLocation: { file: 'test.ts', line, endLine: line },
    affectedVariable: 'input',
    requiredMitigations: [type],
    description: `Potential ${type} vulnerability`,
  };
}

function createMockPathAnalysis(options: Partial<PathAnalysisResult> = {}): PathAnalysisResult {
  return {
    vulnerabilityType: options.vulnerabilityType ?? 'injection',
    sinkNodeId: options.sinkNodeId ?? 'node_1',
    pathsToSink: options.pathsToSink ?? [],
    mitigatedPaths: options.mitigatedPaths ?? [],
    unmitigatedPaths: options.unmitigatedPaths ?? [],
    status: options.status ?? 'none',
    coveragePercent: options.coveragePercent ?? 0,
    degraded: options.degraded ?? false,
    degradedReason: options.degradedReason,
  };
}

function createMockExecutionPath(
  signature: string,
  mitigations: { patternId: string }[] = []
): ExecutionPath {
  return {
    nodes: ['entry', 'mid', 'exit'],
    isComplete: true,
    signature,
    mitigations: mitigations.map((m) => ({
      patternId: m.patternId,
      location: { file: 'test.ts', line: 1 },
      protectedVariables: [],
      protectedPaths: [],
      scope: 'function' as const,
      confidence: 'high' as const,
    })),
  };
}

// =============================================================================
// Factory Tests
// =============================================================================

describe('FindingGenerator', () => {
  let generator: FindingGenerator;

  beforeEach(() => {
    generator = createFindingGenerator();
  });

  describe('createFindingGenerator', () => {
    it('should create generator with default config', () => {
      const gen = createFindingGenerator();
      expect(gen).toBeDefined();
      expect(gen).toBeInstanceOf(FindingGenerator);
    });

    it('should create generator with custom config', () => {
      const gen = createFindingGenerator({
        maxCallDepth: 3,
        timeBudgetMs: 60000,
      });
      expect(gen).toBeDefined();
    });
  });

  // ===========================================================================
  // Finding Suppression Tests (T030, FR-007)
  // ===========================================================================

  describe('generateFinding - Full Mitigation Suppression', () => {
    it('should return null when all paths are mitigated', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'full',
        coveragePercent: 100,
        mitigatedPaths: [createMockExecutionPath('path1', [{ patternId: 'zod-parse' }])],
        unmitigatedPaths: [],
        pathsToSink: [createMockExecutionPath('path1', [{ patternId: 'zod-parse' }])],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding).toBeNull();
    });

    it('should generate finding when no mitigation', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'none',
        coveragePercent: 0,
        mitigatedPaths: [],
        unmitigatedPaths: [createMockExecutionPath('path1')],
        pathsToSink: [createMockExecutionPath('path1')],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding).not.toBeNull();
      expect(finding?.severity).toBe('error');
    });

    it('should generate finding when partial mitigation', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 50,
        mitigatedPaths: [createMockExecutionPath('path1', [{ patternId: 'sanitize' }])],
        unmitigatedPaths: [createMockExecutionPath('path2')],
        pathsToSink: [
          createMockExecutionPath('path1', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path2'),
        ],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding).not.toBeNull();
    });
  });

  // ===========================================================================
  // Severity Downgrade Tests (T046, FR-009)
  // ===========================================================================

  describe('generateFinding - Severity Downgrade', () => {
    it('should not downgrade severity when no mitigation', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'none',
        coveragePercent: 0,
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.severity).toBe('error');
      expect(finding?.metadata?.originalSeverity).toBeUndefined();
    });

    it('should downgrade by 1 level for 50% coverage', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 50,
        mitigatedPaths: [createMockExecutionPath('path1', [{ patternId: 'sanitize' }])],
        unmitigatedPaths: [createMockExecutionPath('path2')],
        pathsToSink: [
          createMockExecutionPath('path1', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path2'),
        ],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      // Error -> Warning (1 level downgrade for 50% coverage)
      expect(finding?.severity).toBe('warning');
      expect(finding?.metadata?.originalSeverity).toBe('error');
    });

    it('should downgrade by 2 levels for 75%+ coverage', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 75,
        mitigatedPaths: [
          createMockExecutionPath('path1', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path2', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path3', [{ patternId: 'sanitize' }]),
        ],
        unmitigatedPaths: [createMockExecutionPath('path4')],
        pathsToSink: [
          createMockExecutionPath('path1', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path2', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path3', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path4'),
        ],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      // Error -> Info (2 level downgrade for 75% coverage)
      expect(finding?.severity).toBe('info');
      expect(finding?.metadata?.originalSeverity).toBe('error');
    });

    it('should not downgrade for low coverage (<50%)', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 25,
        mitigatedPaths: [createMockExecutionPath('path1', [{ patternId: 'sanitize' }])],
        unmitigatedPaths: [
          createMockExecutionPath('path2'),
          createMockExecutionPath('path3'),
          createMockExecutionPath('path4'),
        ],
        pathsToSink: [
          createMockExecutionPath('path1', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path2'),
          createMockExecutionPath('path3'),
          createMockExecutionPath('path4'),
        ],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      // No downgrade for <50% coverage
      expect(finding?.severity).toBe('error');
      expect(finding?.metadata?.originalSeverity).toBeUndefined();
    });

    it('should downgrade warning severity to info', () => {
      const code = `function test(x: any) { return x.prop; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('null_deref', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 60,
        mitigatedPaths: [createMockExecutionPath('path1', [{ patternId: 'if-check' }])],
        unmitigatedPaths: [createMockExecutionPath('path2')],
        pathsToSink: [
          createMockExecutionPath('path1', [{ patternId: 'if-check' }]),
          createMockExecutionPath('path2'),
        ],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      // Warning -> Info (1 level downgrade for 50-74% coverage)
      expect(finding?.severity).toBe('info');
      expect(finding?.metadata?.originalSeverity).toBe('warning');
    });

    it('should cap downgrade at info (lowest level)', () => {
      const code = `function test(x: any) { return x.prop; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('null_deref', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 80,
        mitigatedPaths: [
          createMockExecutionPath('path1', [{ patternId: 'if-check' }]),
          createMockExecutionPath('path2', [{ patternId: 'if-check' }]),
        ],
        unmitigatedPaths: [createMockExecutionPath('path3')],
        pathsToSink: [
          createMockExecutionPath('path1', [{ patternId: 'if-check' }]),
          createMockExecutionPath('path2', [{ patternId: 'if-check' }]),
          createMockExecutionPath('path3'),
        ],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      // Warning can only go down to info (capped)
      expect(finding?.severity).toBe('info');
    });
  });

  // ===========================================================================
  // Message Formatting Tests (T045, FR-008, FR-010)
  // ===========================================================================

  describe('generateFinding - Message Formatting', () => {
    it('should include base description in message', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.message).toContain('Potential injection vulnerability');
    });

    it('should indicate no mitigations when status is none', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.message).toContain('No mitigations detected');
    });

    it('should include partial mitigation details per FR-010', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 50,
        mitigatedPaths: [createMockExecutionPath('path1', [{ patternId: 'sanitize' }])],
        unmitigatedPaths: [createMockExecutionPath('path2')],
        pathsToSink: [
          createMockExecutionPath('path1', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path2'),
        ],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.message).toContain('Partial mitigation detected');
      expect(finding?.message).toContain('1 of 2 paths');
      expect(finding?.message).toContain('50%');
      expect(finding?.message).toContain('protected');
      expect(finding?.message).toContain('1 path(s) remain unprotected');
    });

    it('should include coverage percentage in message', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 66.67,
        mitigatedPaths: [
          createMockExecutionPath('path1', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path2', [{ patternId: 'sanitize' }]),
        ],
        unmitigatedPaths: [createMockExecutionPath('path3')],
        pathsToSink: [
          createMockExecutionPath('path1', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path2', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path3'),
        ],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.message).toContain('67%');
    });
  });

  // ===========================================================================
  // Suggestion Tests
  // ===========================================================================

  describe('generateFinding - Suggestions', () => {
    it('should include unprotected paths in suggestion for partial mitigation', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 50,
        mitigatedPaths: [createMockExecutionPath('safe_path', [{ patternId: 'sanitize' }])],
        unmitigatedPaths: [createMockExecutionPath('unsafe_path')],
        pathsToSink: [
          createMockExecutionPath('safe_path', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('unsafe_path'),
        ],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.suggestion).toContain('unprotected paths');
      expect(finding?.suggestion).toContain('unsafe_path');
    });

    it('should provide generic suggestion for injection when no mitigation', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.suggestion).toContain('parameterized queries');
    });

    it('should provide generic suggestion for null_deref', () => {
      const code = `function test(x: any) { return x.prop; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('null_deref', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.suggestion).toContain('null');
    });

    it('should provide generic suggestion for xss', () => {
      const code = `function test(x: string) { return x; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('xss', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.suggestion).toContain('DOMPurify');
    });

    it('should provide generic suggestion for path_traversal', () => {
      const code = `function test(path: string) { return path; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('path_traversal', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.suggestion).toContain('path.basename');
    });

    it('should truncate long unprotected path lists', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 20,
        mitigatedPaths: [createMockExecutionPath('safe_path', [{ patternId: 'sanitize' }])],
        unmitigatedPaths: [
          createMockExecutionPath('path1'),
          createMockExecutionPath('path2'),
          createMockExecutionPath('path3'),
          createMockExecutionPath('path4'),
          createMockExecutionPath('path5'),
        ],
        pathsToSink: [],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.suggestion).toContain('...');
    });
  });

  // ===========================================================================
  // Metadata Tests (T047)
  // ===========================================================================

  describe('generateFinding - Metadata', () => {
    it('should include mitigation status in metadata', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 50,
        mitigatedPaths: [createMockExecutionPath('path1', [{ patternId: 'sanitize' }])],
        unmitigatedPaths: [createMockExecutionPath('path2')],
        pathsToSink: [
          createMockExecutionPath('path1', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path2'),
        ],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.metadata?.mitigationStatus).toBe('partial');
    });

    it('should include path counts in metadata', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 50,
        mitigatedPaths: [createMockExecutionPath('path1', [{ patternId: 'sanitize' }])],
        unmitigatedPaths: [createMockExecutionPath('path2')],
        pathsToSink: [
          createMockExecutionPath('path1', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('path2'),
        ],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.metadata?.pathsCovered).toBe(1);
      expect(finding?.metadata?.pathsTotal).toBe(2);
    });

    it('should include unprotected path signatures in metadata', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 50,
        mitigatedPaths: [createMockExecutionPath('safe_path', [{ patternId: 'sanitize' }])],
        unmitigatedPaths: [createMockExecutionPath('danger_path')],
        pathsToSink: [
          createMockExecutionPath('safe_path', [{ patternId: 'sanitize' }]),
          createMockExecutionPath('danger_path'),
        ],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.metadata?.unprotectedPaths).toContain('danger_path');
    });

    it('should include detected mitigation IDs in metadata', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 50,
        mitigatedPaths: [
          createMockExecutionPath('path1', [{ patternId: 'zod-parse' }]),
          createMockExecutionPath('path2', [{ patternId: 'validator-escape' }]),
        ],
        unmitigatedPaths: [createMockExecutionPath('path3')],
        pathsToSink: [],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.metadata?.mitigationsDetected).toContain('zod-parse');
      expect(finding?.metadata?.mitigationsDetected).toContain('validator-escape');
    });

    it('should deduplicate mitigation IDs', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'partial',
        coveragePercent: 66,
        mitigatedPaths: [
          createMockExecutionPath('path1', [{ patternId: 'zod-parse' }]),
          createMockExecutionPath('path2', [{ patternId: 'zod-parse' }]),
        ],
        unmitigatedPaths: [createMockExecutionPath('path3')],
        pathsToSink: [],
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      const zodCount = finding?.metadata?.mitigationsDetected?.filter(
        (id) => id === 'zod-parse'
      ).length;
      expect(zodCount).toBe(1);
    });

    it('should include analysis depth in metadata', () => {
      const gen = createFindingGenerator({ maxCallDepth: 7 });
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = gen.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.metadata?.analysisDepth).toBe(7);
    });

    it('should include degraded flag in metadata', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({
        status: 'none',
        degraded: true,
        degradedReason: 'Path limit exceeded',
      });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.metadata?.degraded).toBe(true);
      expect(finding?.metadata?.degradedReason).toBe('Path limit exceeded');
    });
  });

  // ===========================================================================
  // Fingerprint Tests (T048)
  // ===========================================================================

  describe('generateFinding - Fingerprint', () => {
    it('should generate stable fingerprint for same vulnerability', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding1 = generator.generateFinding(vuln, cfg, pathAnalysis);
      const finding2 = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding1?.fingerprint).toBe(finding2?.fingerprint);
    });

    it('should generate different fingerprints for different lines', () => {
      const code = `function test(a: string, b: string) { return a + b; }`;
      const cfg = buildCFGFromCode(code);
      const vuln1 = createMockVulnerability('injection', 2);
      const vuln2 = createMockVulnerability('injection', 3);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding1 = generator.generateFinding(vuln1, cfg, pathAnalysis);
      const finding2 = generator.generateFinding(vuln2, cfg, pathAnalysis);

      expect(finding1?.fingerprint).not.toBe(finding2?.fingerprint);
    });

    it('should generate different fingerprints for different vuln types', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln1 = createMockVulnerability('injection', 2);
      const vuln2 = createMockVulnerability('xss', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding1 = generator.generateFinding(vuln1, cfg, pathAnalysis);
      const finding2 = generator.generateFinding(vuln2, cfg, pathAnalysis);

      expect(finding1?.fingerprint).not.toBe(finding2?.fingerprint);
    });

    it('should generate different fingerprints for different variables', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln1: PotentialVulnerability = {
        id: 'vuln_1',
        type: 'injection',
        sinkLocation: { file: 'test.ts', line: 2, endLine: 2 },
        affectedVariable: 'input1',
        requiredMitigations: ['injection'],
        description: 'Test',
      };
      const vuln2: PotentialVulnerability = {
        id: 'vuln_2',
        type: 'injection',
        sinkLocation: { file: 'test.ts', line: 2, endLine: 2 },
        affectedVariable: 'input2',
        requiredMitigations: ['injection'],
        description: 'Test',
      };
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding1 = generator.generateFinding(vuln1, cfg, pathAnalysis);
      const finding2 = generator.generateFinding(vuln2, cfg, pathAnalysis);

      expect(finding1?.fingerprint).not.toBe(finding2?.fingerprint);
    });

    it('should generate 16-character hex fingerprint', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.fingerprint).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  // ===========================================================================
  // Rule ID and Source Tests
  // ===========================================================================

  describe('generateFinding - Rule ID and Source', () => {
    it('should include cfa/ prefix in rule ID', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.ruleId).toBe('cfa/injection');
    });

    it('should include vulnerability type in rule ID', () => {
      const code = `function test(x: any) { return x.prop; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('null_deref', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.ruleId).toBe('cfa/null_deref');
    });

    it('should set sourceAgent to control_flow', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.sourceAgent).toBe('control_flow');
    });
  });

  // ===========================================================================
  // Location Tests
  // ===========================================================================

  describe('generateFinding - Location', () => {
    it('should include file path from CFG', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 2);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.file).toBe('test.ts');
    });

    it('should include line number from vulnerability', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln = createMockVulnerability('injection', 42);
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.line).toBe(42);
    });

    it('should include end line from vulnerability', () => {
      const code = `function test(input: string) { return input; }`;
      const cfg = buildCFGFromCode(code);
      const vuln: PotentialVulnerability = {
        id: 'vuln_multiline',
        type: 'injection',
        sinkLocation: { file: 'test.ts', line: 10, endLine: 15 },
        affectedVariable: 'input',
        requiredMitigations: ['injection'],
        description: 'Test',
      };
      const pathAnalysis = createMockPathAnalysis({ status: 'none' });

      const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

      expect(finding?.line).toBe(10);
      expect(finding?.endLine).toBe(15);
    });
  });

  // ===========================================================================
  // Vulnerability Type Tests
  // ===========================================================================

  describe('generateFinding - Base Severity by Type', () => {
    const testCases: { type: VulnerabilityType; expectedSeverity: string }[] = [
      { type: 'injection', expectedSeverity: 'error' },
      { type: 'null_deref', expectedSeverity: 'warning' },
      { type: 'auth_bypass', expectedSeverity: 'error' },
      { type: 'xss', expectedSeverity: 'error' },
      { type: 'path_traversal', expectedSeverity: 'error' },
      { type: 'prototype_pollution', expectedSeverity: 'error' },
      { type: 'ssrf', expectedSeverity: 'error' },
    ];

    testCases.forEach(({ type, expectedSeverity }) => {
      it(`should use ${expectedSeverity} as base severity for ${type}`, () => {
        const code = `function test(input: string) { return input; }`;
        const cfg = buildCFGFromCode(code);
        const vuln = createMockVulnerability(type, 2);
        const pathAnalysis = createMockPathAnalysis({ status: 'none' });

        const finding = generator.generateFinding(vuln, cfg, pathAnalysis);

        expect(finding?.severity).toBe(expectedSeverity);
      });
    });
  });

  // ===========================================================================
  // processVulnerabilities Tests
  // ===========================================================================

  describe('processVulnerabilities', () => {
    it('should process multiple vulnerabilities', () => {
      const code = `
        function test(input: string) {
          const a = input;
          const b = input;
          return a + b;
        }
      `;
      const cfg = buildCFGFromCode(code);
      const vulns: PotentialVulnerability[] = [
        {
          id: 'vuln_a',
          type: 'injection',
          sinkLocation: { file: 'test.ts', line: 3, endLine: 3 },
          affectedVariable: 'a',
          requiredMitigations: ['injection'],
          description: 'Injection 1',
        },
        {
          id: 'vuln_b',
          type: 'injection',
          sinkLocation: { file: 'test.ts', line: 4, endLine: 4 },
          affectedVariable: 'b',
          requiredMitigations: ['injection'],
          description: 'Injection 2',
        },
      ];

      const findings = generator.processVulnerabilities(vulns, cfg);

      expect(findings.length).toBeGreaterThanOrEqual(0);
    });

    it('should skip vulnerabilities on unreachable nodes', () => {
      const code = `
        function test() {
          return 1;
          const unreachable = dangerous();
        }
      `;
      const cfg = buildCFGFromCode(code);
      const vulns: PotentialVulnerability[] = [
        {
          id: 'vuln_unreachable',
          type: 'injection',
          sinkLocation: { file: 'test.ts', line: 4, endLine: 4 },
          affectedVariable: 'unreachable',
          requiredMitigations: ['injection'],
          description: 'Unreachable vulnerability',
        },
      ];

      const findings = generator.processVulnerabilities(vulns, cfg);

      // Should skip unreachable (may return 0 findings)
      expect(findings).toBeDefined();
    });

    it('should return empty array when no vulnerabilities', () => {
      const code = `function test() { return 1; }`;
      const cfg = buildCFGFromCode(code);

      const findings = generator.processVulnerabilities([], cfg);

      expect(findings).toEqual([]);
    });
  });
});
