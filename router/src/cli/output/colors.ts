/**
 * ANSI Color Utilities
 *
 * Provides ANSI color codes for terminal output with support for:
 * - NO_COLOR environment variable (standard convention)
 * - FORCE_COLOR environment variable (force colors even without TTY)
 * - TTY detection for automatic color support
 *
 * Reference: https://no-color.org/
 */

// =============================================================================
// ANSI Color Codes
// =============================================================================

/**
 * ANSI escape codes for colors and formatting
 */
export const ANSI = {
  // Reset
  reset: '\x1b[0m',

  // Formatting
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',
  strikethrough: '\x1b[9m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
} as const;

export type AnsiCode = keyof typeof ANSI;

// =============================================================================
// Color Support Detection
// =============================================================================

/**
 * Check if terminal supports colors.
 *
 * Priority:
 * 1. NO_COLOR set (any value) -> false
 * 2. FORCE_COLOR set (any value) -> true
 * 3. Otherwise -> check if stdout is TTY
 *
 * @param env - Environment variables (defaults to process.env)
 * @param isTTY - Whether stdout is a TTY (defaults to process.stdout.isTTY)
 * @returns true if colors should be used
 */
export function supportsColor(
  env: Record<string, string | undefined> = process.env,
  isTTY: boolean = process.stdout?.isTTY ?? false
): boolean {
  // NO_COLOR takes precedence (standard convention)
  if (env['NO_COLOR'] !== undefined) {
    return false;
  }

  // FORCE_COLOR forces colors even without TTY
  if (env['FORCE_COLOR'] !== undefined) {
    return true;
  }

  // Fall back to TTY detection
  return isTTY;
}

// =============================================================================
// Colorization Utilities
// =============================================================================

/**
 * Apply ANSI color code to text, respecting color support.
 *
 * @param text - Text to colorize
 * @param code - ANSI code to apply (from ANSI object)
 * @param colored - Whether colors are enabled
 * @returns Colorized text or plain text if colors disabled
 */
export function colorize(text: string, code: string, colored: boolean): string {
  if (!colored) {
    return text;
  }
  return `${code}${text}${ANSI.reset}`;
}

/**
 * Apply multiple ANSI codes to text.
 *
 * @param text - Text to colorize
 * @param codes - Array of ANSI codes to apply
 * @param colored - Whether colors are enabled
 * @returns Colorized text or plain text if colors disabled
 */
export function colorizeMulti(text: string, codes: string[], colored: boolean): string {
  if (!colored || codes.length === 0) {
    return text;
  }
  return `${codes.join('')}${text}${ANSI.reset}`;
}

// =============================================================================
// Severity Color Mapping
// =============================================================================

/**
 * Severity levels for findings
 */
export type Severity = 'error' | 'warning' | 'info';

/**
 * Get ANSI color code for a severity level.
 *
 * @param severity - Finding severity
 * @returns ANSI color code
 */
export function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case 'error':
      return ANSI.red;
    case 'warning':
      return ANSI.yellow;
    case 'info':
      return ANSI.blue;
    default:
      return '';
  }
}

/**
 * Colorize text based on severity.
 *
 * @param text - Text to colorize
 * @param severity - Finding severity
 * @param colored - Whether colors are enabled
 * @returns Colorized text
 */
export function colorizeSeverity(text: string, severity: Severity, colored: boolean): string {
  return colorize(text, getSeverityColor(severity), colored);
}

/**
 * Get severity label with appropriate color.
 *
 * @param severity - Finding severity
 * @param colored - Whether colors are enabled
 * @returns Formatted severity label
 */
export function formatSeverityLabel(severity: Severity, colored: boolean): string {
  const labels: Record<Severity, string> = {
    error: 'error',
    warning: 'warning',
    info: 'info',
  };

  const label = labels[severity] ?? severity;
  return colorize(label, getSeverityColor(severity), colored);
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Create a colorizer function bound to a specific color state.
 *
 * @param colored - Whether colors are enabled
 * @returns Object with color functions
 */
export function createColorizer(colored: boolean) {
  return {
    red: (text: string) => colorize(text, ANSI.red, colored),
    green: (text: string) => colorize(text, ANSI.green, colored),
    yellow: (text: string) => colorize(text, ANSI.yellow, colored),
    blue: (text: string) => colorize(text, ANSI.blue, colored),
    cyan: (text: string) => colorize(text, ANSI.cyan, colored),
    magenta: (text: string) => colorize(text, ANSI.magenta, colored),
    gray: (text: string) => colorize(text, ANSI.gray, colored),
    white: (text: string) => colorize(text, ANSI.white, colored),
    bold: (text: string) => colorize(text, ANSI.bold, colored),
    dim: (text: string) => colorize(text, ANSI.dim, colored),
    italic: (text: string) => colorize(text, ANSI.italic, colored),
    underline: (text: string) => colorize(text, ANSI.underline, colored),
    inverse: (text: string) => colorize(text, ANSI.inverse, colored),
    error: (text: string) => colorizeSeverity(text, 'error', colored),
    warning: (text: string) => colorizeSeverity(text, 'warning', colored),
    info: (text: string) => colorizeSeverity(text, 'info', colored),
  };
}

/**
 * Strip ANSI codes from text.
 *
 * @param text - Text potentially containing ANSI codes
 * @returns Text with ANSI codes removed
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Get the visible length of text (excluding ANSI codes).
 *
 * @param text - Text potentially containing ANSI codes
 * @returns Visible character count
 */
export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}
