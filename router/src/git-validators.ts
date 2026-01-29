/**
 * Git Input Validators
 *
 * Defense-in-depth protection against command injection.
 * Per INVARIANT #6 (Untrusted Input Model): PR code, diffs, repo contents,
 * and filenames MUST be treated as hostile.
 *
 * These validators enforce strict character allowlists at all git command boundaries.
 *
 * SECURITY ANALYSIS:
 * ==================
 * 1. SafeGitRefHelpers.parse() validates git refs using an ALLOWLIST pattern:
 *    - Max 256 characters
 *    - Must start with alphanumeric (no option injection via leading -)
 *    - Only permits [a-zA-Z0-9][a-zA-Z0-9\-_/.]*
 *    - Forbids path traversal (..)
 *    - Forbids shell metacharacters (; | & $ ` etc.)
 *    This EXCLUDES all shell metacharacters by design.
 *
 * 2. UNSAFE_PATH_CHARS is a BLOCKLIST - explicitly rejects ; | & $ ` \ ! < > ( ) { } [ ] ' " * ? \n \r \0
 *    Any path containing these characters is rejected.
 *
 * 3. Both patterns are tested in git-validators.test.ts with command injection attempts:
 *    - $(command) substitution
 *    - `command` backticks
 *    - ; && || command chaining
 *    - | pipe injection
 *    - $VAR environment expansion
 *    - > < redirection
 *
 * 4. Primary protection is shell-free execution (execFileSync with shell: false).
 *    These validators are DEFENSE-IN-DEPTH.
 */

import { ValidationError, ValidationErrorCode } from './types/errors.js';
import { type SafeGitRef, SafeGitRefHelpers } from './types/branded.js';
import { type Result, Err, isOk } from './types/result.js';

/**
 * Shell metacharacters that MUST NOT appear in paths passed to execSync
 */
const UNSAFE_PATH_CHARS = /[;|&$`\\!<>(){}[\]'"*?\n\r\0]/g;

/**
 * Maximum path length (defensive limit)
 */
const MAX_PATH_LENGTH = 4096;

/**
 * Get list of unsafe characters found in a path (for debugging).
 * Returns human-readable representation of detected metacharacters.
 *
 * @param path - The path to analyze
 * @returns String listing unsafe chars found, or 'none'
 */
export function getUnsafeCharsInPath(path: string): string {
  const matches = path.match(UNSAFE_PATH_CHARS);
  if (!matches) return 'none';

  const unique = [...new Set(matches)];
  return unique
    .map((c) => {
      if (c === '\n') return '\\n';
      if (c === '\r') return '\\r';
      if (c === '\0') return '\\0';
      return c;
    })
    .join(' ');
}

/**
 * Validate a git ref (SHA, branch name, tag, refs/heads/...) for safe shell use.
 *
 * Uses SafeGitRefHelpers validation to ensure consistent security checks:
 * - Max 256 characters
 * - Must start with alphanumeric
 * - No path traversal (..)
 * - No shell metacharacters
 *
 * @param ref - The git reference to validate
 * @param name - Human-readable name for error messages (e.g., 'baseSha', 'headSha')
 * @throws ValidationError if the ref contains unsafe characters or patterns
 */
export function assertSafeGitRef(ref: string, name: string): void {
  const result = SafeGitRefHelpers.parse(ref);

  if (!isOk(result)) {
    // Construct user-friendly error message with field name
    const originalMsg = result.error.message;
    let message: string;

    if (originalMsg.includes('cannot exceed')) {
      message = `Invalid ${name}: length ${ref.length} exceeds maximum allowed characters`;
    } else if (originalMsg.includes('empty')) {
      message = `Invalid ${name}: value is empty or undefined`;
    } else if (
      originalMsg.includes('invalid characters') ||
      originalMsg.includes('forbidden pattern')
    ) {
      // Find the first invalid character for helpful error message
      const invalidChar = ref.split('').find((c) => !/[a-zA-Z0-9\-_/.]/.test(c));
      message =
        `Invalid ${name}: contains unsafe character '${invalidChar ?? 'unknown'}'. ` +
        `Only alphanumeric, hyphen, underscore, forward slash, and dot are allowed.`;
    } else {
      message = `Invalid ${name}: ${originalMsg}`;
    }

    throw new ValidationError(message, ValidationErrorCode.INVALID_GIT_REF, {
      field: name,
      value: ref,
      constraint: result.error.context['constraint'] as string | undefined,
    });
  }
}

/**
 * Parse and validate a git ref, returning a branded SafeGitRef on success.
 *
 * This delegates to SafeGitRefHelpers.parse() to ensure all SafeGitRef
 * invariants are properly enforced (max 256 chars, no leading dash,
 * no path traversal, no shell metacharacters).
 *
 * This is the Result-returning version for use with the Result pattern.
 * For backward compatibility, use assertSafeGitRef() which throws on error.
 *
 * @param ref - The git reference to validate
 * @param name - Human-readable name for error context (e.g., 'baseSha', 'headSha')
 * @returns Result<SafeGitRef, ValidationError>
 */
export function parseSafeGitRef(ref: string, name: string): Result<SafeGitRef, ValidationError> {
  // Delegate to SafeGitRefHelpers.parse() to ensure all SafeGitRef invariants are enforced
  const result = SafeGitRefHelpers.parse(ref);

  if (isOk(result)) {
    return result;
  }

  // Construct user-friendly error message with field name
  const originalMsg = result.error.message;
  let message: string;

  if (originalMsg.includes('cannot exceed')) {
    message = `Invalid ${name}: length ${ref.length} exceeds maximum allowed characters`;
  } else if (originalMsg.includes('empty')) {
    message = `Invalid ${name}: value is empty or undefined`;
  } else if (
    originalMsg.includes('invalid characters') ||
    originalMsg.includes('forbidden pattern')
  ) {
    // Find the first invalid character for helpful error message
    const invalidChar = ref.split('').find((c) => !/[a-zA-Z0-9\-_/.]/.test(c));
    message =
      `Invalid ${name}: contains unsafe character '${invalidChar ?? 'unknown'}'. ` +
      `Only alphanumeric, hyphen, underscore, forward slash, and dot are allowed.`;
  } else {
    message = `Invalid ${name}: ${originalMsg}`;
  }

  return Err(
    new ValidationError(message, ValidationErrorCode.INVALID_GIT_REF, {
      field: name,
      value: ref,
      constraint: result.error.context['constraint'] as string | undefined,
    })
  );
}

/**
 * Assert a git ref is safe and return it as a branded SafeGitRef.
 *
 * This is the throwing version that returns a SafeGitRef.
 * Combines validation and branding in one call.
 *
 * @param ref - The git reference to validate
 * @param name - Human-readable name for error messages
 * @returns SafeGitRef - The validated and branded reference
 * @throws ValidationError if the ref contains unsafe characters
 */
export function assertAndBrandGitRef(ref: string, name: string): SafeGitRef {
  const result = parseSafeGitRef(ref, name);
  if (!isOk(result)) {
    throw result.error;
  }
  return result.value;
}

/**
 * Validate a file path for safe shell use.
 *
 * @param path - The file path to validate
 * @param name - Human-readable name for error messages (e.g., 'file path')
 * @throws Error if the path contains unsafe characters
 */
export function assertSafePath(filePath: string, name: string): void {
  if (!filePath) {
    throw new ValidationError(
      `Invalid ${name}: value is empty or undefined`,
      ValidationErrorCode.INVALID_PATH,
      {
        field: name,
        value: filePath,
        constraint: 'non-empty',
      }
    );
  }

  if (filePath.length > MAX_PATH_LENGTH) {
    throw new ValidationError(
      `Invalid ${name}: length ${filePath.length} exceeds maximum ${MAX_PATH_LENGTH} characters`,
      ValidationErrorCode.INVALID_PATH,
      {
        field: name,
        value: filePath,
        constraint: `max-length-${MAX_PATH_LENGTH}`,
      }
    );
  }

  if (UNSAFE_PATH_CHARS.test(filePath)) {
    const unsafeChars = getUnsafeCharsInPath(filePath);
    throw new ValidationError(
      `Invalid ${name}: contains unsafe characters [${unsafeChars}]. ` +
        `Shell metacharacters ; | & $ \` \\ ! < > ( ) { } [ ] ' " * ? are not allowed.`,
      ValidationErrorCode.INVALID_PATH,
      {
        field: name,
        value: filePath,
        constraint: 'safe-characters',
      }
    );
  }
}

/**
 * Validate a repository path for safe shell use.
 *
 * Security model:
 * - Shell metacharacters are blocked by assertSafePath (the real protection)
 * - Relative paths like "../target" are legitimate in CI (used to reference target repo)
 * - path.resolve() normalizes the path, but protection comes from character blocklist
 *
 * @param repoPath - The repository path to validate
 * @throws Error if the path contains unsafe shell metacharacters
 */
export function assertSafeRepoPath(repoPath: string): void {
  // All protection comes from blocking shell metacharacters
  // Relative paths like "../target" are legitimate CI use cases
  assertSafePath(repoPath, 'repoPath');
}
