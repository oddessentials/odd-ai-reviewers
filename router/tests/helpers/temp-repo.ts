/**
 * Temporary Repository Helper for Testing
 *
 * Provides `makeTempRepo()` helper with automatic cleanup via Vitest hooks.
 * Guarantees cleanup even when tests fail, preventing temp directory leaks.
 *
 * @module tests/helpers/temp-repo
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { afterEach, afterAll } from 'vitest';

// =============================================================================
// Types
// =============================================================================

/**
 * Represents a temporary repository for testing.
 */
export interface TempRepo {
  /** Absolute path to the temporary directory */
  readonly path: string;

  /** Manually trigger cleanup (for early cleanup scenarios) */
  readonly cleanup: () => void;
}

/**
 * Options for creating a temporary repository.
 */
export interface TempRepoOptions {
  /** Initialize as a git repository (default: true) */
  readonly initGit?: boolean;

  /** Create an initial commit (default: false) */
  readonly initialCommit?: boolean;

  /** Files to create in the repo (path -> content) */
  readonly files?: Record<string, string>;
}

/**
 * Factory function signature for makeTempRepo.
 */
export type MakeTempRepo = (options?: TempRepoOptions) => TempRepo;

// =============================================================================
// Implementation
// =============================================================================

/** Track all created temp directories for cleanup */
const tempDirs: string[] = [];

/**
 * Create a temporary repository for testing.
 *
 * Features:
 * - Automatically cleaned up after each test via Vitest hooks
 * - Optionally initializes as a git repository
 * - Can create initial files and commits
 * - Supports manual early cleanup via returned `cleanup()` method
 *
 * @param options - Configuration for the temp repo
 * @returns TempRepo with path and cleanup method
 *
 * @example
 * ```typescript
 * const repo = makeTempRepo({ initGit: true, initialCommit: true });
 * // Use repo.path for testing
 * // Cleanup happens automatically after the test
 * ```
 */
export function makeTempRepo(options: TempRepoOptions = {}): TempRepo {
  const { initGit = true, initialCommit = false, files = {} } = options;

  const tempDir = mkdtempSync(join(tmpdir(), 'ai-review-test-'));
  tempDirs.push(tempDir);

  // Create files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(tempDir, filePath);
    const dir = dirname(fullPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
  }

  // Initialize git
  if (initGit) {
    execSync('git init', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
  }

  // Initial commit
  if (initGit && initialCommit) {
    // Create a .gitkeep if no files were provided
    if (Object.keys(files).length === 0) {
      writeFileSync(join(tempDir, '.gitkeep'), '');
    }
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: 'pipe' });
  }

  const cleanup = () => {
    const index = tempDirs.indexOf(tempDir);
    if (index > -1) {
      tempDirs.splice(index, 1);
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors - directory may already be gone
      }
    }
  };

  return { path: tempDir, cleanup };
}

// =============================================================================
// Vitest Hooks - Automatic Cleanup
// =============================================================================

/**
 * Register cleanup hooks with Vitest.
 * This ensures temp dirs are cleaned up even if tests fail.
 */
afterEach(() => {
  // Clean up all temp dirs created during this test
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
});

afterAll(() => {
  // Backstop: verify all temp dirs cleaned up
  const remaining = tempDirs.length;
  if (remaining > 0) {
    console.warn(`WARNING: ${remaining} temp directories not cleaned up`);
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
});
