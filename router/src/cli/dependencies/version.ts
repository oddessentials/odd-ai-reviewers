/**
 * Version parsing and comparison utilities for dependency checking.
 * @module cli/dependencies/version
 */

/**
 * Parsed semantic version components.
 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

/**
 * Default regex pattern to extract semver from version output.
 * Matches patterns like "1.2.3", "v1.2.3", embedded in any text.
 */
const DEFAULT_VERSION_REGEX = /(\d+)\.(\d+)\.(\d+)/;

/**
 * Parses a version string from command output.
 *
 * @param output - Raw output from --version command
 * @param regex - Optional custom regex to extract version (must have capture groups for major.minor.patch or single group for full version)
 * @returns Parsed version or null if parsing failed
 *
 * @example
 * ```ts
 * parseVersion('semgrep 1.56.0'); // { major: 1, minor: 56, patch: 0, raw: '1.56.0' }
 * parseVersion('reviewdog version: 0.17.4'); // { major: 0, minor: 17, patch: 4, raw: '0.17.4' }
 * parseVersion('invalid output'); // null
 * ```
 */
export function parseVersion(output: string, regex?: RegExp): ParsedVersion | null {
  const pattern = regex ?? DEFAULT_VERSION_REGEX;
  const match = output.match(pattern);

  if (!match) {
    return null;
  }

  // If regex has 3+ capture groups, use them as major/minor/patch
  if (match.length >= 4 && match[1] && match[2] && match[3]) {
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const patch = parseInt(match[3], 10);

    if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
      return null;
    }

    return {
      major,
      minor,
      patch,
      raw: `${major}.${minor}.${patch}`,
    };
  }

  // If regex has single capture group, try to parse it as semver
  if (match.length >= 2 && match[1]) {
    const versionStr = match[1];
    const parts = versionStr.split('.');

    if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
      const major = parseInt(parts[0], 10);
      const minor = parseInt(parts[1], 10);
      const patch = parseInt(parts[2], 10);

      if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
        return null;
      }

      return {
        major,
        minor,
        patch,
        raw: `${major}.${minor}.${patch}`,
      };
    }
  }

  return null;
}

/**
 * Compares two parsed versions.
 *
 * @param a - First version
 * @param b - Second version
 * @returns -1 if a < b, 0 if a == b, 1 if a > b
 *
 * @example
 * ```ts
 * compareVersions(v1_0_0, v1_0_1); // -1
 * compareVersions(v1_0_0, v1_0_0); // 0
 * compareVersions(v2_0_0, v1_9_9); // 1
 * ```
 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): -1 | 0 | 1 {
  if (a.major !== b.major) {
    return a.major > b.major ? 1 : -1;
  }
  if (a.minor !== b.minor) {
    return a.minor > b.minor ? 1 : -1;
  }
  if (a.patch !== b.patch) {
    return a.patch > b.patch ? 1 : -1;
  }
  return 0;
}

/**
 * Checks if an installed version meets the minimum required version.
 *
 * @param installed - The installed version
 * @param minimum - The minimum required version string (e.g., "1.0.0")
 * @returns true if installed >= minimum, false otherwise
 *
 * @example
 * ```ts
 * meetsMinimum({ major: 1, minor: 5, patch: 0, raw: '1.5.0' }, '1.0.0'); // true
 * meetsMinimum({ major: 0, minor: 9, patch: 0, raw: '0.9.0' }, '1.0.0'); // false
 * ```
 */
export function meetsMinimum(installed: ParsedVersion, minimum: string): boolean {
  const minVersion = parseVersion(minimum);

  if (!minVersion) {
    // If we can't parse the minimum, assume it's met (fail open)
    return true;
  }

  return compareVersions(installed, minVersion) >= 0;
}

/**
 * Extracts version string from command output using a regex.
 * Convenience function that returns just the raw version string.
 *
 * @param output - Raw output from --version command
 * @param regex - Optional custom regex
 * @returns Version string or null if parsing failed
 */
export function extractVersionString(output: string, regex?: RegExp): string | null {
  const parsed = parseVersion(output, regex);
  return parsed?.raw ?? null;
}
