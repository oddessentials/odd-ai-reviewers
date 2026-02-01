/**
 * ANSI Color Utilities
 *
 * Provides ANSI color codes with support for NO_COLOR and FORCE_COLOR env vars.
 * Falls back gracefully when colors are not supported.
 *
 * @module cli/output/colors
 */

// =============================================================================
// ANSI Color Codes
// =============================================================================

/**
 * ANSI escape codes for colors and styles
 */
export const ANSI = {
  // Colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m',

  // Styles
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',

  // Reset
  reset: '\x1b[0m',
} as const;

export type AnsiCode = keyof typeof ANSI;

// =============================================================================
// Color Support Detection
// =============================================================================

/**
 * Check if stdout supports colors.
 *
 * Priority:
 * 1. NO_COLOR env var (disables colors if set to any value)
 * 2. FORCE_COLOR env var (enables colors if set to any value)
 * 3. TTY detection (colors if stdout is a TTY)
 *
 * @param env - Environment variables (defaults to process.env)
 * @param isTTY - Whether stdout is a TTY (defaults to process.stdout.isTTY)
 */
export function supportsColor(
  env: Record<string, string | undefined> = process.env,
  isTTY: boolean = process.stdout?.isTTY ?? false
): boolean {
  // NO_COLOR takes precedence (https://no-color.org/)
  const noColor = env['NO_COLOR'];
  if (noColor !== undefined && noColor !== '') {
    return false;
  }

  // FORCE_COLOR overrides TTY detection
  const forceColor = env['FORCE_COLOR'];
  if (forceColor !== undefined && forceColor !== '') {
    return true;
  }

  // Default to TTY detection
  return isTTY;
}

// =============================================================================
// Colorization
// =============================================================================

/**
 * Wrap text with ANSI color code if colors are supported.
 *
 * @param text - Text to colorize
 * @param code - ANSI code to apply
 * @param colored - Whether colors are enabled
 */
export function colorize(text: string, code: AnsiCode, colored: boolean): string {
  if (!colored) {
    return text;
  }
  return `${ANSI[code]}${text}${ANSI.reset}`;
}

/**
 * Apply multiple ANSI codes to text.
 *
 * @param text - Text to colorize
 * @param codes - ANSI codes to apply (in order)
 * @param colored - Whether colors are enabled
 */
export function colorizeMulti(text: string, codes: AnsiCode[], colored: boolean): string {
  if (!colored || codes.length === 0) {
    return text;
  }
  const prefix = codes.map((c) => ANSI[c]).join('');
  return `${prefix}${text}${ANSI.reset}`;
}

// =============================================================================
// Severity Colors
// =============================================================================

/**
 * Severity level type
 */
export type Severity = 'error' | 'warning' | 'info';

/**
 * Map severity to ANSI color code
 */
export function severityColor(severity: Severity): AnsiCode {
  switch (severity) {
    case 'error':
      return 'red';
    case 'warning':
      return 'yellow';
    case 'info':
      return 'blue';
  }
}

/**
 * Colorize text based on severity
 */
export function colorizeSeverity(text: string, severity: Severity, colored: boolean): string {
  return colorize(text, severityColor(severity), colored);
}

/**
 * Get severity emoji
 */
export function severityEmoji(severity: Severity): string {
  switch (severity) {
    case 'error':
      return '🔴';
    case 'warning':
      return '🟡';
    case 'info':
      return '🔵';
  }
}

/**
 * Get severity text label (for non-emoji contexts)
 */
export function severityLabel(severity: Severity): string {
  switch (severity) {
    case 'error':
      return '[E]';
    case 'warning':
      return '[W]';
    case 'info':
      return '[I]';
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Create a colorizer function bound to a specific color state
 */
export function createColorizer(colored: boolean) {
  return {
    red: (text: string) => colorize(text, 'red', colored),
    green: (text: string) => colorize(text, 'green', colored),
    yellow: (text: string) => colorize(text, 'yellow', colored),
    blue: (text: string) => colorize(text, 'blue', colored),
    cyan: (text: string) => colorize(text, 'cyan', colored),
    gray: (text: string) => colorize(text, 'gray', colored),
    bold: (text: string) => colorize(text, 'bold', colored),
    dim: (text: string) => colorize(text, 'dim', colored),
    severity: (text: string, sev: Severity) => colorizeSeverity(text, sev, colored),
  };
}
