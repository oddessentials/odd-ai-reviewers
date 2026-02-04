/**
 * Platform detection utility for CLI dependency checking.
 * @module cli/dependencies/platform
 */

import os from 'os';

import type { Platform } from './types.js';

/**
 * Detects the current operating system platform.
 *
 * @returns The detected platform ('darwin', 'win32', or 'linux')
 * @throws Error if running on an unsupported platform
 *
 * @example
 * ```ts
 * const platform = detectPlatform();
 * console.log(platform); // 'darwin' on macOS
 * ```
 */
export function detectPlatform(): Platform {
  const nodePlatform = os.platform();

  switch (nodePlatform) {
    case 'darwin':
      return 'darwin';
    case 'win32':
      return 'win32';
    case 'linux':
      return 'linux';
    default:
      // For unsupported platforms, default to linux-style instructions
      // as they're most likely to work on Unix-like systems
      return 'linux';
  }
}

/**
 * Checks if the current platform is supported.
 *
 * @returns true if the platform is explicitly supported
 */
export function isSupportedPlatform(): boolean {
  const nodePlatform = os.platform();
  return nodePlatform === 'darwin' || nodePlatform === 'win32' || nodePlatform === 'linux';
}
