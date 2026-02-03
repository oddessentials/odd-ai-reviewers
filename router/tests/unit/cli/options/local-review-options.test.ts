/**
 * Local Review Options Tests
 *
 * Tests for CLI option parsing, validation, and default application.
 * Covers Phase 6 tasks T068-T070.
 */

import { describe, it, expect } from 'vitest';
import {
  parseLocalReviewOptions,
  applyOptionDefaults,
  resolveOutputFormat,
  resolveBaseRef,
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
