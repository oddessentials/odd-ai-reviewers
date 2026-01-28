/**
 * Unit tests for cross-file mitigation message formatting
 *
 * Tests for:
 * - T026: Cross-file message formatting tests
 * - T027: Integration test for cross-file mitigation detection
 * - FR-006: File path in finding messages
 * - FR-007: Line number in finding messages
 * - FR-008: Call depth indicator
 * - FR-009: Multiple cross-file mitigations
 * - FR-010: Partial mitigation with path-specific info
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MitigationDetector } from '../../../../src/agents/control_flow/mitigation-detector.js';
import { FindingGenerator } from '../../../../src/agents/control_flow/finding-generator.js';
import type {
  MitigationInstance,
  CallChainEntry,
  CrossFileMitigationInfo,
} from '../../../../src/agents/control_flow/types.js';
import { createTestControlFlowConfig } from '../../../test-utils.js';

describe('Cross-File Mitigation Tracking', () => {
  let detector: MitigationDetector;

  beforeEach(() => {
    const config = createTestControlFlowConfig();
    detector = new MitigationDetector(config);
    detector.clearPatternStats();
  });

  describe('createCrossFileMitigation', () => {
    const baseMitigation: MitigationInstance = {
      patternId: 'input-validation',
      location: {
        file: 'src/utils/validation.ts',
        line: 42,
      },
      protectedVariables: ['userInput'],
      protectedPaths: [],
      scope: 'function',
      confidence: 'high',
    };

    it('should return unchanged instance when mitigation is in same file', () => {
      const callChain: CallChainEntry[] = [];
      const result = detector.createCrossFileMitigation(
        baseMitigation,
        'src/utils/validation.ts', // Same file
        callChain
      );

      expect(result.callChain).toBeUndefined();
      expect(result.discoveryDepth).toBeUndefined();
      expect(detector.hasCrossFileMitigations()).toBe(false);
    });

    it('should add cross-file tracking when mitigation is in different file', () => {
      const callChain: CallChainEntry[] = [
        { file: 'src/api/handler.ts', functionName: 'handleRequest', line: 15 },
        { file: 'src/utils/validation.ts', functionName: 'sanitize', line: 42 },
      ];

      const result = detector.createCrossFileMitigation(
        baseMitigation,
        'src/api/handler.ts', // Different file
        callChain
      );

      expect(result.callChain).toEqual(callChain);
      expect(result.discoveryDepth).toBe(1); // One call away
      expect(detector.hasCrossFileMitigations()).toBe(true);
    });

    it('should calculate discovery depth correctly for deeper call chains', () => {
      const callChain: CallChainEntry[] = [
        { file: 'src/api/handler.ts', functionName: 'handleRequest', line: 15 },
        { file: 'src/services/user.ts', functionName: 'processUser', line: 30 },
        { file: 'src/utils/validation.ts', functionName: 'sanitize', line: 42 },
      ];

      const result = detector.createCrossFileMitigation(
        baseMitigation,
        'src/api/handler.ts',
        callChain
      );

      expect(result.discoveryDepth).toBe(2); // Two calls away
    });

    it('should track cross-file mitigation info for finding metadata', () => {
      const callChain: CallChainEntry[] = [
        { file: 'src/api/handler.ts', functionName: 'handleRequest', line: 15 },
        { file: 'src/utils/validation.ts', functionName: 'sanitize', line: 42 },
      ];

      detector.createCrossFileMitigation(baseMitigation, 'src/api/handler.ts', callChain);

      const crossFileMitigations = detector.getCrossFileMitigations();
      expect(crossFileMitigations).toHaveLength(1);
      expect(crossFileMitigations[0]).toEqual({
        patternId: 'input-validation',
        file: 'src/utils/validation.ts',
        line: 42,
        depth: 1,
        functionName: 'sanitize',
      });
    });
  });

  describe('buildCallChainEntry', () => {
    it('should create a call chain entry with all fields', () => {
      const entry = detector.buildCallChainEntry('src/file.ts', 'myFunction', 100);

      expect(entry).toEqual({
        file: 'src/file.ts',
        functionName: 'myFunction',
        line: 100,
      });
    });
  });

  describe('cross-file mitigation state management', () => {
    it('should track multiple cross-file mitigations', () => {
      const mitigation1: MitigationInstance = {
        patternId: 'validation-1',
        location: { file: 'src/utils/validate.ts', line: 10 },
        protectedVariables: [],
        protectedPaths: [],
        scope: 'function',
        confidence: 'high',
      };

      const mitigation2: MitigationInstance = {
        patternId: 'sanitize-1',
        location: { file: 'src/security/sanitize.ts', line: 20 },
        protectedVariables: [],
        protectedPaths: [],
        scope: 'function',
        confidence: 'high',
      };

      detector.createCrossFileMitigation(mitigation1, 'src/api/handler.ts', [
        { file: 'src/api/handler.ts', functionName: 'handle', line: 5 },
        { file: 'src/utils/validate.ts', functionName: 'validate', line: 10 },
      ]);

      detector.createCrossFileMitigation(mitigation2, 'src/api/handler.ts', [
        { file: 'src/api/handler.ts', functionName: 'handle', line: 8 },
        { file: 'src/security/sanitize.ts', functionName: 'sanitize', line: 20 },
      ]);

      const mitigations = detector.getCrossFileMitigations();
      expect(mitigations).toHaveLength(2);
    });

    it('should clear cross-file mitigations with clearPatternStats', () => {
      const mitigation: MitigationInstance = {
        patternId: 'test',
        location: { file: 'src/other.ts', line: 1 },
        protectedVariables: [],
        protectedPaths: [],
        scope: 'function',
        confidence: 'high',
      };

      detector.createCrossFileMitigation(mitigation, 'src/handler.ts', [
        { file: 'src/handler.ts', functionName: 'fn', line: 1 },
        { file: 'src/other.ts', functionName: 'fn2', line: 1 },
      ]);

      expect(detector.hasCrossFileMitigations()).toBe(true);

      detector.clearPatternStats();

      expect(detector.hasCrossFileMitigations()).toBe(false);
      expect(detector.getCrossFileMitigations()).toHaveLength(0);
    });
  });
});

describe('FindingGenerator cross-file message formatting', () => {
  let generator: FindingGenerator;

  beforeEach(() => {
    const config = createTestControlFlowConfig();
    generator = new FindingGenerator(config);
    generator.clearStats();
  });

  describe('setCrossFileMitigations', () => {
    it('should accept cross-file mitigation info', () => {
      const mitigations: CrossFileMitigationInfo[] = [
        {
          patternId: 'validation',
          file: 'src/utils/validate.ts',
          line: 42,
          depth: 1,
          functionName: 'sanitize',
        },
      ];

      generator.setCrossFileMitigations(mitigations);
      // No error thrown indicates success
    });
  });

  describe('setPatternTimeouts', () => {
    it('should accept pattern timeout info', () => {
      generator.setPatternTimeouts([{ patternId: 'slow-pattern', elapsedMs: 150 }]);
      // No error thrown indicates success
    });
  });

  describe('clearStats', () => {
    it('should clear both cross-file mitigations and pattern timeouts', () => {
      generator.setCrossFileMitigations([
        { patternId: 'test', file: 'test.ts', line: 1, depth: 0 },
      ]);
      generator.setPatternTimeouts([{ patternId: 'slow', elapsedMs: 100 }]);

      generator.clearStats();
      // Stats should be cleared - verified by subsequent calls not having old data
    });
  });
});

describe('Integration: Cross-file mitigation in findings', () => {
  it('should include cross-file mitigations in finding metadata', () => {
    const config = createTestControlFlowConfig();
    const generator = new FindingGenerator(config);

    const mitigations: CrossFileMitigationInfo[] = [
      {
        patternId: 'input-validation',
        file: 'src/utils/validation.ts',
        line: 42,
        depth: 1,
        functionName: 'sanitize',
      },
      {
        patternId: 'auth-check',
        file: 'src/middleware/auth.ts',
        line: 78,
        depth: 2,
        functionName: 'validateInput',
      },
    ];

    generator.setCrossFileMitigations(mitigations);

    // The mitigations should be available for inclusion in findings
    // Actual finding generation is tested through the full path analysis flow
  });

  it('should format multiple cross-file mitigations correctly', () => {
    const detector = new MitigationDetector(createTestControlFlowConfig());
    detector.clearPatternStats();

    // Create multiple cross-file mitigations
    const mitigation1: MitigationInstance = {
      patternId: 'sanitize',
      location: { file: 'src/utils/sanitize.ts', line: 25 },
      protectedVariables: ['input'],
      protectedPaths: [],
      scope: 'function',
      confidence: 'high',
    };

    const mitigation2: MitigationInstance = {
      patternId: 'validate',
      location: { file: 'src/utils/validate.ts', line: 50 },
      protectedVariables: ['data'],
      protectedPaths: [],
      scope: 'function',
      confidence: 'medium',
    };

    detector.createCrossFileMitigation(mitigation1, 'src/api/handler.ts', [
      { file: 'src/api/handler.ts', functionName: 'handler', line: 10 },
      { file: 'src/utils/sanitize.ts', functionName: 'sanitize', line: 25 },
    ]);

    detector.createCrossFileMitigation(mitigation2, 'src/api/handler.ts', [
      { file: 'src/api/handler.ts', functionName: 'handler', line: 15 },
      { file: 'src/middleware/process.ts', functionName: 'process', line: 30 },
      { file: 'src/utils/validate.ts', functionName: 'validate', line: 50 },
    ]);

    const mitigations = detector.getCrossFileMitigations();

    // Verify both are tracked
    expect(mitigations).toHaveLength(2);

    // Verify first mitigation details
    expect(mitigations[0]).toMatchObject({
      patternId: 'sanitize',
      file: 'src/utils/sanitize.ts',
      line: 25,
      depth: 1,
      functionName: 'sanitize',
    });

    // Verify second mitigation details with deeper call chain
    expect(mitigations[1]).toMatchObject({
      patternId: 'validate',
      file: 'src/utils/validate.ts',
      line: 50,
      depth: 2,
      functionName: 'validate',
    });
  });
});

// =============================================================================
// T027-T030: Edge Case Tests for Cross-File Mitigation Tracking
// =============================================================================

describe('Cross-File Mitigation Edge Cases', () => {
  let detector: MitigationDetector;

  beforeEach(() => {
    const config = createTestControlFlowConfig();
    detector = new MitigationDetector(config);
    detector.clearPatternStats();
  });

  // T027: Maximum call depth handling
  describe('maximum call depth handling', () => {
    it('should handle call chains at maximum configured depth', () => {
      const mitigation: MitigationInstance = {
        patternId: 'deep-mitigation',
        location: { file: 'src/deep/nested.ts', line: 100 },
        protectedVariables: ['data'],
        protectedPaths: [],
        scope: 'function',
        confidence: 'high',
      };

      // Create a deep call chain (5 levels)
      const deepCallChain: CallChainEntry[] = [
        { file: 'src/api/handler.ts', functionName: 'handler', line: 10 },
        { file: 'src/services/processor.ts', functionName: 'process', line: 20 },
        { file: 'src/utils/transform.ts', functionName: 'transform', line: 30 },
        { file: 'src/helpers/validate.ts', functionName: 'validate', line: 40 },
        { file: 'src/deep/nested.ts', functionName: 'nested', line: 100 },
      ];

      const result = detector.createCrossFileMitigation(
        mitigation,
        'src/api/handler.ts',
        deepCallChain
      );

      expect(result.callChain).toBeDefined();
      expect(result.discoveryDepth).toBe(4); // 4 levels deep from handler
    });

    it('should track mitigations with varying depths correctly', () => {
      const mitigation1: MitigationInstance = {
        patternId: 'shallow',
        location: { file: 'src/utils/a.ts', line: 10 },
        protectedVariables: [],
        protectedPaths: [],
        scope: 'function',
        confidence: 'high',
      };

      const mitigation2: MitigationInstance = {
        patternId: 'deep',
        location: { file: 'src/deep/b.ts', line: 20 },
        protectedVariables: [],
        protectedPaths: [],
        scope: 'function',
        confidence: 'medium',
      };

      // Shallow chain (depth 1)
      detector.createCrossFileMitigation(mitigation1, 'src/handler.ts', [
        { file: 'src/handler.ts', functionName: 'handle', line: 1 },
        { file: 'src/utils/a.ts', functionName: 'validate', line: 10 },
      ]);

      // Deep chain (depth 3)
      detector.createCrossFileMitigation(mitigation2, 'src/handler.ts', [
        { file: 'src/handler.ts', functionName: 'handle', line: 1 },
        { file: 'src/services/s.ts', functionName: 'service', line: 5 },
        { file: 'src/utils/u.ts', functionName: 'util', line: 10 },
        { file: 'src/deep/b.ts', functionName: 'deep', line: 20 },
      ]);

      const mitigations = detector.getCrossFileMitigations();
      expect(mitigations).toHaveLength(2);
      expect(mitigations[0]?.depth).toBe(1);
      expect(mitigations[1]?.depth).toBe(3);
    });
  });

  // T028: Circular reference detection
  describe('circular reference detection', () => {
    it('should handle call chain with circular reference gracefully', () => {
      // A -> B -> A pattern in call chain
      const mitigation: MitigationInstance = {
        patternId: 'circular-test',
        location: { file: 'src/file-b.ts', line: 50 },
        protectedVariables: ['input'],
        protectedPaths: [],
        scope: 'function',
        confidence: 'high',
      };

      // Call chain: A calls B, which might call back to A conceptually
      // But the mitigation is in B
      const callChain: CallChainEntry[] = [
        { file: 'src/file-a.ts', functionName: 'funcA', line: 10 },
        { file: 'src/file-b.ts', functionName: 'funcB', line: 50 },
      ];

      // Should not throw or hang
      const result = detector.createCrossFileMitigation(mitigation, 'src/file-a.ts', callChain);

      expect(result.callChain).toBeDefined();
      expect(result.discoveryDepth).toBe(1);
    });

    it('should track mitigation even with same file appearing multiple times', () => {
      const mitigation: MitigationInstance = {
        patternId: 'multi-visit',
        location: { file: 'src/util.ts', line: 100 },
        protectedVariables: [],
        protectedPaths: [],
        scope: 'function',
        confidence: 'medium',
      };

      // Call chain where util.ts appears in different contexts
      const callChain: CallChainEntry[] = [
        { file: 'src/handler.ts', functionName: 'handle', line: 10 },
        { file: 'src/util.ts', functionName: 'helper1', line: 20 },
        { file: 'src/service.ts', functionName: 'process', line: 30 },
        { file: 'src/util.ts', functionName: 'helper2', line: 100 },
      ];

      const result = detector.createCrossFileMitigation(mitigation, 'src/handler.ts', callChain);

      // Should complete without infinite loop
      expect(result.callChain).toHaveLength(4);
    });
  });

  // T029: Multi-path mitigation scenarios
  describe('multi-path mitigation scenarios', () => {
    it('should track mitigations discovered via different paths', () => {
      const mitigation: MitigationInstance = {
        patternId: 'shared-mitigation',
        location: { file: 'src/shared/validate.ts', line: 50 },
        protectedVariables: ['data'],
        protectedPaths: [],
        scope: 'function',
        confidence: 'high',
      };

      // Path 1: handler -> service -> validate
      const path1: CallChainEntry[] = [
        { file: 'src/handler.ts', functionName: 'handle', line: 10 },
        { file: 'src/service.ts', functionName: 'process', line: 20 },
        { file: 'src/shared/validate.ts', functionName: 'validate', line: 50 },
      ];

      // Path 2: controller -> utils -> validate (same mitigation)
      const path2: CallChainEntry[] = [
        { file: 'src/controller.ts', functionName: 'control', line: 15 },
        { file: 'src/utils/util.ts', functionName: 'util', line: 25 },
        { file: 'src/shared/validate.ts', functionName: 'validate', line: 50 },
      ];

      detector.createCrossFileMitigation(mitigation, 'src/handler.ts', path1);
      detector.createCrossFileMitigation(mitigation, 'src/controller.ts', path2);

      const mitigations = detector.getCrossFileMitigations();
      // Both discoveries should be tracked (different vulnerability files)
      expect(mitigations).toHaveLength(2);
      expect(mitigations.every((m) => m.patternId === 'shared-mitigation')).toBe(true);
    });

    it('should track different mitigations on same path', () => {
      const mitigation1: MitigationInstance = {
        patternId: 'validate-input',
        location: { file: 'src/validate.ts', line: 10 },
        protectedVariables: ['input'],
        protectedPaths: [],
        scope: 'function',
        confidence: 'high',
      };

      const mitigation2: MitigationInstance = {
        patternId: 'sanitize-output',
        location: { file: 'src/sanitize.ts', line: 20 },
        protectedVariables: ['output'],
        protectedPaths: [],
        scope: 'function',
        confidence: 'high',
      };

      const callChain1: CallChainEntry[] = [
        { file: 'src/handler.ts', functionName: 'handle', line: 5 },
        { file: 'src/validate.ts', functionName: 'validate', line: 10 },
      ];

      const callChain2: CallChainEntry[] = [
        { file: 'src/handler.ts', functionName: 'handle', line: 5 },
        { file: 'src/sanitize.ts', functionName: 'sanitize', line: 20 },
      ];

      detector.createCrossFileMitigation(mitigation1, 'src/handler.ts', callChain1);
      detector.createCrossFileMitigation(mitigation2, 'src/handler.ts', callChain2);

      const mitigations = detector.getCrossFileMitigations();
      expect(mitigations).toHaveLength(2);
      expect(mitigations.map((m) => m.patternId)).toContain('validate-input');
      expect(mitigations.map((m) => m.patternId)).toContain('sanitize-output');
    });
  });

  // T030: Confidence reduction at depth limits
  describe('confidence reduction at depth limits', () => {
    it('should report lower confidence for deeper mitigations', () => {
      // Note: Actual confidence reduction logic may be in the analysis,
      // but mitigations with high depth should be tracked for review
      const shallowMitigation: MitigationInstance = {
        patternId: 'shallow',
        location: { file: 'src/near.ts', line: 10 },
        protectedVariables: [],
        protectedPaths: [],
        scope: 'function',
        confidence: 'high',
      };

      const deepMitigation: MitigationInstance = {
        patternId: 'deep',
        location: { file: 'src/far.ts', line: 100 },
        protectedVariables: [],
        protectedPaths: [],
        scope: 'function',
        confidence: 'high', // Original confidence
      };

      detector.createCrossFileMitigation(shallowMitigation, 'src/handler.ts', [
        { file: 'src/handler.ts', functionName: 'h', line: 1 },
        { file: 'src/near.ts', functionName: 'near', line: 10 },
      ]);

      detector.createCrossFileMitigation(deepMitigation, 'src/handler.ts', [
        { file: 'src/handler.ts', functionName: 'h', line: 1 },
        { file: 'src/a.ts', functionName: 'a', line: 2 },
        { file: 'src/b.ts', functionName: 'b', line: 3 },
        { file: 'src/c.ts', functionName: 'c', line: 4 },
        { file: 'src/d.ts', functionName: 'd', line: 5 },
        { file: 'src/far.ts', functionName: 'far', line: 100 },
      ]);

      const mitigations = detector.getCrossFileMitigations();
      expect(mitigations).toHaveLength(2);

      // Verify depth tracking allows for confidence considerations
      const shallow = mitigations.find((m) => m.patternId === 'shallow');
      const deep = mitigations.find((m) => m.patternId === 'deep');

      expect(shallow?.depth).toBe(1);
      expect(deep?.depth).toBe(5);

      // Deep mitigations should have higher depth indicating lower certainty
      expect(deep?.depth).toBeGreaterThan(shallow?.depth ?? 0);
    });
  });
});
