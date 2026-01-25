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
 * 1. SAFE_REF_PATTERN is an ALLOWLIST - only permits [a-zA-Z0-9\-_/.]+
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

/**
 * Safe characters for git refs (SHAs, branch names, tags):
 * - Hexadecimal digits (for SHAs)
 * - Alphanumeric (for branch/tag names)
 * - Forward slash (for refs/heads/main, origin/main)
 * - Hyphen, underscore, dot (common in branch names)
 *
 * This explicitly EXCLUDES shell metacharacters: ; | & $ ` \ ! < > ( ) { } [ ] ' " * ? \n \r
 */
const SAFE_REF_PATTERN = /^[a-zA-Z0-9\-_/.]+$/;

/**
 * Maximum length for git refs (defensive limit)
 * Git allows up to 256 bytes, but refs/heads/... can be longer
 */
const MAX_REF_LENGTH = 512;

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
 * @param ref - The git reference to validate
 * @param name - Human-readable name for error messages (e.g., 'baseSha', 'headSha')
 * @throws Error if the ref contains unsafe characters
 */
export function assertSafeGitRef(ref: string, name: string): void {
  if (!ref) {
    throw new Error(`Invalid ${name}: value is empty or undefined`);
  }

  if (ref.length > MAX_REF_LENGTH) {
    throw new Error(
      `Invalid ${name}: length ${ref.length} exceeds maximum ${MAX_REF_LENGTH} characters`
    );
  }

  if (!SAFE_REF_PATTERN.test(ref)) {
    // Find the first invalid character for helpful error message
    const invalidChar = ref.split('').find((c) => !/[a-zA-Z0-9\-_/.]/.test(c));
    throw new Error(
      `Invalid ${name}: contains unsafe character '${invalidChar}'. ` +
        `Only alphanumeric, hyphen, underscore, forward slash, and dot are allowed.`
    );
  }
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
    throw new Error(`Invalid ${name}: value is empty or undefined`);
  }

  if (filePath.length > MAX_PATH_LENGTH) {
    throw new Error(
      `Invalid ${name}: length ${filePath.length} exceeds maximum ${MAX_PATH_LENGTH} characters`
    );
  }

  if (UNSAFE_PATH_CHARS.test(filePath)) {
    const unsafeChars = getUnsafeCharsInPath(filePath);
    throw new Error(
      `Invalid ${name}: contains unsafe characters [${unsafeChars}]. ` +
        `Shell metacharacters ; | & $ \` \\ ! < > ( ) { } [ ] ' " * ? are not allowed.`
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
