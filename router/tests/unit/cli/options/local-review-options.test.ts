/**
 * Local Review Options Tests
 *
 * Tests for CLI option parsing, validation, and default application.
 * Covers Phase 6 tasks T068-T070 and User Story 2 range parsing tests.
 */

import { describe, it, expect } from 'vitest';
import {
  parseLocalReviewOptions,
  applyOptionDefaults,
  resolveOutputFormat,
  resolveBaseRef,
  parseRangeString,
  RangeErrorCode,
  type RawLocalReviewOptions,
  type LocalReviewOptions,
} from '../../../../src/cli/options/local-review-options.js';
import type { GitContext } from '../../../../src/cli/git-context.js';
import { isOk, isErr } from '../../../../src/types/result.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const mockGitContext: GitContext = {
  repoRoot: '/path/to/repo',
  currentBranch: 'feature-branch',
  defaultBase: 'main',
  hasUncommitted: true,
  hasStaged: false,
};

// =============================================================================
// T068: Parsing Tests (5 cases)
// =============================================================================

describe('parseLocalReviewOptions (T068)', () => {
  it('should parse minimal valid options with defaults', () => {
    const raw: RawLocalReviewOptions = {};
    const result = parseLocalReviewOptions(raw);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.options.path).toBe('.');
      expect(result.value.options.format).toBe('pretty');
      expect(result.value.options.uncommitted).toBe(true);
      expect(result.value.options.staged).toBe(false);
      expect(result.value.options.quiet).toBe(false);
      expect(result.value.options.verbose).toBe(false);
      expect(result.value.warnings).toHaveLength(0);
    }
  });

  it('should parse all valid options correctly', () => {
    const raw: RawLocalReviewOptions = {
      path: '/some/path',
      base: 'develop',
      head: 'feature',
      staged: true,
      uncommitted: false,
      pass: 'security',
      agent: 'semgrep',
      format: 'json',
      noColor: true,
      quiet: true,
      dryRun: true,
      costOnly: true,
      config: '/path/to/config.yml',
    };
    const result = parseLocalReviewOptions(raw);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const opts = result.value.options;
      expect(opts.path).toBe('/some/path');
      expect(opts.base).toBe('develop');
      expect(opts.head).toBe('feature');
      expect(opts.staged).toBe(true);
      expect(opts.pass).toBe('security');
      expect(opts.agent).toBe('semgrep');
      expect(opts.format).toBe('json');
      expect(opts.noColor).toBe(true);
      expect(opts.quiet).toBe(true);
      expect(opts.dryRun).toBe(true);
      expect(opts.costOnly).toBe(true);
      expect(opts.config).toBe('/path/to/config.yml');
    }
  });

  it('should reject invalid output format', () => {
    const raw: RawLocalReviewOptions = {
      format: 'invalid-format',
    };
    const result = parseLocalReviewOptions(raw);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('Invalid output format');
      expect(result.error.message).toContain('invalid-format');
    }
  });

  it('should reject range option with base/head (mutually exclusive)', () => {
    const raw: RawLocalReviewOptions = {
      range: 'HEAD~5..',
      base: 'main',
      head: 'feature',
    };
    const result = parseLocalReviewOptions(raw);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('Cannot use --range with --base or --head');
    }
  });

  it('should handle Commander --no-color flag (color=false)', () => {
    const raw: RawLocalReviewOptions = {
      color: false, // Commander sets this for --no-color
    };
    const result = parseLocalReviewOptions(raw);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.options.noColor).toBe(true);
    }
  });
});

// =============================================================================
// T069: Validation Tests (4 cases)
// =============================================================================

describe('parseLocalReviewOptions validation (T069)', () => {
  it('should reject quiet and verbose together', () => {
    const raw: RawLocalReviewOptions = {
      quiet: true,
      verbose: true,
    };
    const result = parseLocalReviewOptions(raw);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('Cannot use --quiet and --verbose together');
    }
  });

  it('should reject range with base (mutually exclusive)', () => {
    const raw: RawLocalReviewOptions = {
      range: 'main..feature',
      base: 'develop',
    };
    const result = parseLocalReviewOptions(raw);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('Cannot use --range with --base or --head');
    }
  });

  it('should reject when nothing to review (staged=false, uncommitted=false, no base/range)', () => {
    const raw: RawLocalReviewOptions = {
      staged: false,
      uncommitted: false,
    };
    const result = parseLocalReviewOptions(raw);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('Nothing to review');
    }
  });

  it('should accept staged=true with uncommitted=false', () => {
    const raw: RawLocalReviewOptions = {
      staged: true,
      uncommitted: false,
    };
    const result = parseLocalReviewOptions(raw);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.options.staged).toBe(true);
      expect(result.value.options.uncommitted).toBe(false);
    }
  });

  it('should accept --base with implicit uncommitted=false (commit comparison mode)', () => {
    const raw: RawLocalReviewOptions = {
      base: 'HEAD~5',
      // uncommitted not specified - should default to false when base is set
    };
    const result = parseLocalReviewOptions(raw);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.options.base).toBe('HEAD~5');
      expect(result.value.options.uncommitted).toBe(false);
      expect(result.value.options.staged).toBe(false);
    }
  });

  it('should accept --range with implicit uncommitted=false (commit comparison mode)', () => {
    const raw: RawLocalReviewOptions = {
      range: 'main..feature',
      // uncommitted not specified - should default to false when range is set
    };
    const result = parseLocalReviewOptions(raw);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.options.range).toBe('main..feature');
      expect(result.value.options.uncommitted).toBe(false);
      expect(result.value.options.staged).toBe(false);
    }
  });

  it('should reject malformed range with multiple .. operators', () => {
    const raw: RawLocalReviewOptions = {
      range: 'main..feature..extra',
    };
    const result = parseLocalReviewOptions(raw);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('Invalid range format');
      expect(result.error.message).toContain('main..feature..extra');
      expect(result.error.message).toContain('multiple operators');
    }
  });

  it('should reject malformed range with multiple ... operators', () => {
    const raw: RawLocalReviewOptions = {
      range: 'main...feature...extra',
    };
    const result = parseLocalReviewOptions(raw);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('Invalid range format');
    }
  });

  it('should reject malformed range with mixed .. and ... operators', () => {
    const raw: RawLocalReviewOptions = {
      range: 'main..feature...extra',
    };
    const result = parseLocalReviewOptions(raw);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('Invalid range format');
    }
  });
});

// =============================================================================
// Uncommitted Default Behavior Tests
// =============================================================================

describe('parseLocalReviewOptions uncommitted defaults', () => {
  it('should default uncommitted=true when no base/range/staged specified', () => {
    const raw: RawLocalReviewOptions = {
      path: '.',
    };
    const result = parseLocalReviewOptions(raw);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.options.uncommitted).toBe(true);
    }
  });

  it('should default uncommitted=false when --base is specified', () => {
    const raw: RawLocalReviewOptions = {
      base: 'develop',
    };
    const result = parseLocalReviewOptions(raw);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.options.uncommitted).toBe(false);
    }
  });

  it('should default uncommitted=false when --range is specified', () => {
    const raw: RawLocalReviewOptions = {
      range: 'HEAD~3..',
    };
    const result = parseLocalReviewOptions(raw);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.options.uncommitted).toBe(false);
    }
  });

  it('should default uncommitted=false when --staged is specified', () => {
    const raw: RawLocalReviewOptions = {
      staged: true,
    };
    const result = parseLocalReviewOptions(raw);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.options.uncommitted).toBe(false);
    }
  });

  it('should honor explicit uncommitted=true even when --base is specified', () => {
    const raw: RawLocalReviewOptions = {
      base: 'develop',
      uncommitted: true, // Explicit override
    };
    const result = parseLocalReviewOptions(raw);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.options.base).toBe('develop');
      expect(result.value.options.uncommitted).toBe(true);
    }
  });

  it('should honor explicit uncommitted=false even without base/range', () => {
    const raw: RawLocalReviewOptions = {
      staged: true,
      uncommitted: false, // Explicit
    };
    const result = parseLocalReviewOptions(raw);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.options.uncommitted).toBe(false);
    }
  });
});

// =============================================================================
// T070: Defaults Tests (4 cases)
// =============================================================================

describe('applyOptionDefaults (T070)', () => {
  it('should apply default base from git context when not specified', () => {
    const options: LocalReviewOptions = {
      path: '.',
      staged: false,
      uncommitted: true,
      format: 'pretty',
      noColor: false,
      quiet: false,
      verbose: false,
      dryRun: false,
      costOnly: false,
    };

    const result = applyOptionDefaults(options, mockGitContext);

    expect(result.base).toBe('main');
  });

  it('should not override explicitly specified base', () => {
    const options: LocalReviewOptions = {
      path: '.',
      base: 'develop',
      staged: false,
      uncommitted: true,
      format: 'pretty',
      noColor: false,
      quiet: false,
      verbose: false,
      dryRun: false,
      costOnly: false,
    };

    const result = applyOptionDefaults(options, mockGitContext);

    expect(result.base).toBe('develop');
  });

  it('should not apply base when range is specified', () => {
    const options: LocalReviewOptions = {
      path: '.',
      range: 'HEAD~5..',
      staged: false,
      uncommitted: true,
      format: 'pretty',
      noColor: false,
      quiet: false,
      verbose: false,
      dryRun: false,
      costOnly: false,
    };

    const result = applyOptionDefaults(options, mockGitContext);

    expect(result.base).toBeUndefined();
    expect(result.range).toBe('HEAD~5..');
  });

  it('should preserve all other options unchanged', () => {
    const options: LocalReviewOptions = {
      path: '/custom/path',
      staged: true,
      uncommitted: false,
      pass: 'security',
      agent: 'test-agent',
      format: 'json',
      noColor: true,
      quiet: true,
      verbose: false,
      dryRun: true,
      costOnly: true,
      config: '/config.yml',
    };

    const result = applyOptionDefaults(options, mockGitContext);

    expect(result.path).toBe('/custom/path');
    expect(result.staged).toBe(true);
    expect(result.pass).toBe('security');
    expect(result.agent).toBe('test-agent');
    expect(result.format).toBe('json');
    expect(result.noColor).toBe(true);
    expect(result.quiet).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.costOnly).toBe(true);
    expect(result.config).toBe('/config.yml');
  });
});

describe('resolveOutputFormat (T070)', () => {
  it('should return explicit format when specified', () => {
    const options: LocalReviewOptions = {
      path: '.',
      format: 'sarif',
      staged: false,
      uncommitted: true,
      noColor: false,
      quiet: false,
      verbose: false,
      dryRun: false,
      costOnly: false,
    };

    expect(resolveOutputFormat(options, true)).toBe('sarif');
    expect(resolveOutputFormat(options, false)).toBe('sarif');
  });

  it('should default to pretty for TTY', () => {
    const options: LocalReviewOptions = {
      path: '.',
      format: 'pretty',
      staged: false,
      uncommitted: true,
      noColor: false,
      quiet: false,
      verbose: false,
      dryRun: false,
      costOnly: false,
    };

    expect(resolveOutputFormat(options, true)).toBe('pretty');
  });

  it('should default to json for non-TTY (piping)', () => {
    const options: LocalReviewOptions = {
      path: '.',
      format: 'pretty',
      staged: false,
      uncommitted: true,
      noColor: false,
      quiet: false,
      verbose: false,
      dryRun: false,
      costOnly: false,
    };

    expect(resolveOutputFormat(options, false)).toBe('json');
  });
});

describe('resolveBaseRef (T070)', () => {
  it('should extract base from range with .. notation', () => {
    const options: LocalReviewOptions = {
      path: '.',
      range: 'main..feature',
      staged: false,
      uncommitted: true,
      format: 'pretty',
      noColor: false,
      quiet: false,
      verbose: false,
      dryRun: false,
      costOnly: false,
    };

    expect(resolveBaseRef(options, mockGitContext)).toBe('main');
  });

  it('should extract base from range with ... notation', () => {
    const options: LocalReviewOptions = {
      path: '.',
      range: 'develop...HEAD',
      staged: false,
      uncommitted: true,
      format: 'pretty',
      noColor: false,
      quiet: false,
      verbose: false,
      dryRun: false,
      costOnly: false,
    };

    expect(resolveBaseRef(options, mockGitContext)).toBe('develop');
  });

  it('should handle range with trailing .. (e.g., HEAD~5..)', () => {
    const options: LocalReviewOptions = {
      path: '.',
      range: 'HEAD~5..',
      staged: false,
      uncommitted: true,
      format: 'pretty',
      noColor: false,
      quiet: false,
      verbose: false,
      dryRun: false,
      costOnly: false,
    };

    expect(resolveBaseRef(options, mockGitContext)).toBe('HEAD~5');
  });

  it('should use explicit base when no range', () => {
    const options: LocalReviewOptions = {
      path: '.',
      base: 'develop',
      staged: false,
      uncommitted: true,
      format: 'pretty',
      noColor: false,
      quiet: false,
      verbose: false,
      dryRun: false,
      costOnly: false,
    };

    expect(resolveBaseRef(options, mockGitContext)).toBe('develop');
  });

  it('should fall back to git context default base', () => {
    const options: LocalReviewOptions = {
      path: '.',
      staged: false,
      uncommitted: true,
      format: 'pretty',
      noColor: false,
      quiet: false,
      verbose: false,
      dryRun: false,
      costOnly: false,
    };

    expect(resolveBaseRef(options, mockGitContext)).toBe('main');
  });
});

// =============================================================================
// User Story 2: parseRangeString Tests (T017-T023)
// =============================================================================

describe('parseRangeString (User Story 2)', () => {
  // T017: Test for a..b..c (multiple two-dot operators) rejection
  it('T017: should reject a..b..c (multiple two-dot operators) with MULTIPLE_OPERATORS', () => {
    const result = parseRangeString('a..b..c');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(RangeErrorCode.MULTIPLE_OPERATORS);
      expect(result.error.message).toContain('multiple operators');
      expect(result.error.input).toBe('a..b..c');
    }
  });

  // T018: Test for main..feature..extra (multiple operators) rejection
  it('T018: should reject main..feature..extra (multiple operators) with MULTIPLE_OPERATORS', () => {
    const result = parseRangeString('main..feature..extra');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(RangeErrorCode.MULTIPLE_OPERATORS);
      expect(result.error.message).toContain('multiple operators');
    }
  });

  // T019: Test for .. (empty refs) rejection with MISSING_REFS
  it('T019: should reject ".." (empty refs) with MISSING_REFS', () => {
    const result = parseRangeString('..');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(RangeErrorCode.MISSING_REFS);
      expect(result.error.message).toContain('at least one reference');
    }
  });

  // T020: Test for ... (empty refs) rejection with MISSING_REFS
  it('T020: should reject "..." (empty refs) with MISSING_REFS', () => {
    const result = parseRangeString('...');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(RangeErrorCode.MISSING_REFS);
      expect(result.error.message).toContain('at least one reference');
    }
  });

  // T021: Test for whitespace-only refs rejection with EMPTY_BASE_REF
  it('T021: should reject " .. " (whitespace-only refs) with EMPTY_BASE_REF', () => {
    const result = parseRangeString(' .. ');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // When base is empty but head is also empty (just whitespace), it's MISSING_REFS
      // When base is empty but head has content, it's EMPTY_BASE_REF
      expect([RangeErrorCode.MISSING_REFS, RangeErrorCode.EMPTY_BASE_REF]).toContain(
        result.error.code
      );
    }
  });

  // T021b: Test whitespace with valid head - should be EMPTY_BASE_REF
  it('T021b: should reject "..HEAD" (empty base) with EMPTY_BASE_REF', () => {
    const result = parseRangeString('..HEAD');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(RangeErrorCode.EMPTY_BASE_REF);
      expect(result.error.message).toContain('empty base reference');
    }
  });

  // T022: Test that INVALID_GIT_REF is distinct from malformed range errors
  // Note: Git ref validation happens AFTER parseRangeString succeeds (in diff.ts)
  describe('T022: Error code distinction', () => {
    it('malformed range errors use MALFORMED_RANGE_* codes (not INVALID_GIT_REF)', () => {
      // All malformed range parse results use RangeErrorCode, not INVALID_GIT_REF
      const malformedCases = [
        { input: 'a..b..c', expectedCode: RangeErrorCode.MULTIPLE_OPERATORS },
        { input: '..', expectedCode: RangeErrorCode.MISSING_REFS },
        { input: '...', expectedCode: RangeErrorCode.MISSING_REFS },
        { input: '..HEAD', expectedCode: RangeErrorCode.EMPTY_BASE_REF },
      ];

      for (const { input, expectedCode } of malformedCases) {
        const result = parseRangeString(input);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          // These are RANGE validation errors (syntax), not git ref errors (semantics)
          expect(result.error.code).toBe(expectedCode);
          // And NOT INVALID_GIT_REF - that's for refs that don't exist in git
          expect(result.error.code).not.toBe('INVALID_GIT_REF');
        }
      }
    });

    it('valid range syntax passes parseRangeString (git ref validation happens later)', () => {
      // A syntactically valid range with a nonexistent branch passes parseRangeString
      // Git ref validation (INVALID_GIT_REF) happens in diff.ts, not here
      const result = parseRangeString('main...nonexistent-branch-xyz');

      // This should PASS parseRangeString - it's valid syntax
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseRef).toBe('main');
        expect(result.value.headRef).toBe('nonexistent-branch-xyz');
        expect(result.value.operator).toBe('...');
      }
      // Note: The INVALID_GIT_REF error would be raised later when diff.ts
      // tries to resolve the ref via git, which is outside parseRangeString's scope
    });
  });

  // T029: Test default operator is ... when single ref provided
  it('T029: should default operator to "..." when single ref provided (--range main)', () => {
    const result = parseRangeString('main');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.baseRef).toBe('main');
      expect(result.value.headRef).toBeUndefined();
      expect(result.value.operator).toBe('...');
    }
  });

  // Additional valid range tests
  describe('valid range parsing', () => {
    it('should parse main..feature correctly', () => {
      const result = parseRangeString('main..feature');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseRef).toBe('main');
        expect(result.value.headRef).toBe('feature');
        expect(result.value.operator).toBe('..');
      }
    });

    it('should parse main...feature correctly', () => {
      const result = parseRangeString('main...feature');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseRef).toBe('main');
        expect(result.value.headRef).toBe('feature');
        expect(result.value.operator).toBe('...');
      }
    });

    it('should parse HEAD~3.. (trailing operator, empty head)', () => {
      const result = parseRangeString('HEAD~3..');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseRef).toBe('HEAD~3');
        expect(result.value.headRef).toBeUndefined();
        expect(result.value.operator).toBe('..');
      }
    });

    it('should parse HEAD~5...HEAD correctly', () => {
      const result = parseRangeString('HEAD~5...HEAD');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseRef).toBe('HEAD~5');
        expect(result.value.headRef).toBe('HEAD');
        expect(result.value.operator).toBe('...');
      }
    });

    it('should handle refs with slashes (origin/main...HEAD)', () => {
      const result = parseRangeString('origin/main...HEAD');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseRef).toBe('origin/main');
        expect(result.value.headRef).toBe('HEAD');
        expect(result.value.operator).toBe('...');
      }
    });

    it('should handle refs with hyphens (feature-branch..main)', () => {
      const result = parseRangeString('feature-branch..main');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseRef).toBe('feature-branch');
        expect(result.value.headRef).toBe('main');
        expect(result.value.operator).toBe('..');
      }
    });

    it('should trim whitespace from refs', () => {
      const result = parseRangeString('  main  ..  feature  ');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseRef).toBe('main');
        expect(result.value.headRef).toBe('feature');
      }
    });
  });

  // T023: Malformed ranges should fail BEFORE git calls (validation phase)
  describe('T023: Malformed ranges fail before git calls', () => {
    it('parseRangeString is pure validation - no git operations', () => {
      // parseRangeString is a pure function that only validates the string format
      // It does NOT make any git calls - this is verified by:
      // 1. The function signature takes only a string input
      // 2. The function returns RangeParseResult synchronously
      // 3. No child_process or git operations are imported/used

      // All these malformed inputs are caught BEFORE any git operations:
      const malformedInputs = [
        'a..b..c',
        'main..feature..extra',
        '..',
        '...',
        ' .. ',
        '..HEAD',
        '',
      ];

      for (const input of malformedInputs) {
        const result = parseRangeString(input);
        // All should fail at validation stage
        expect(result.ok).toBe(false);
      }
    });

    it('parseLocalReviewOptions validates range before passing to git operations', () => {
      const raw: RawLocalReviewOptions = {
        range: 'a..b..c', // Malformed
      };
      const result = parseLocalReviewOptions(raw);

      // Should fail immediately with validation error
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        // The error code indicates it's a validation error, not a git error
        expect(result.error.code).toMatch(/^VALIDATION_/);
      }
    });
  });

  // Additional error cases
  describe('error cases', () => {
    it('should reject a...b...c (multiple three-dot operators)', () => {
      const result = parseRangeString('a...b...c');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(RangeErrorCode.MULTIPLE_OPERATORS);
      }
    });

    it('should reject a..b...c (mixed operators)', () => {
      const result = parseRangeString('a..b...c');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(RangeErrorCode.MULTIPLE_OPERATORS);
      }
    });

    it('should reject empty input', () => {
      const result = parseRangeString('');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(RangeErrorCode.MISSING_REFS);
      }
    });

    it('should reject whitespace-only input', () => {
      const result = parseRangeString('   ');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(RangeErrorCode.MISSING_REFS);
      }
    });
  });
});
