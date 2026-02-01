/**
 * Interactive Prompts Module
 *
 * Feature 015: Config Wizard & Validation
 * Provides readline-based interactive prompt utilities for CLI commands.
 *
 * Uses Node.js built-in readline/promises API (no external dependencies).
 * Implements numbered choices for cross-platform terminal compatibility.
 *
 * @module interactive-prompts
 * @see {@link ../../../specs/015-config-wizard-validate/spec.md} Feature specification
 */

import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

/**
 * Represents a single selectable option in interactive prompts.
 *
 * @template T - The type of the value returned when this option is selected
 *
 * @example
 * ```typescript
 * const platformOptions: PromptOption<string>[] = [
 *   { label: 'GitHub', value: 'github', description: 'GitHub.com or Enterprise' },
 *   { label: 'Azure DevOps', value: 'ado', description: 'Azure DevOps Services' },
 * ];
 * ```
 */
export interface PromptOption<T> {
  /** Display label shown to user (e.g., "GitHub", "OpenAI") */
  label: string;
  /** Value returned when this option is selected */
  value: T;
  /** Optional description shown in parentheses after label */
  description?: string;
}

/**
 * Result from an interactive prompt.
 *
 * Discriminated union type that represents either:
 * - A successful selection with `status: 'selected'` and the selected `value`
 * - A cancellation (Ctrl+C or EOF) with `status: 'cancelled'`
 *
 * @template T - The type of the selected value
 *
 * @example
 * ```typescript
 * const result = await promptSelect(rl, 'Select:', options);
 * if (result.status === 'selected') {
 *   console.log(`Selected: ${result.value}`);
 * } else {
 *   console.log('User cancelled');
 * }
 * ```
 */
export type PromptResult<T> = { status: 'selected'; value: T } | { status: 'cancelled' };

/**
 * Display numbered options and prompt user for selection.
 *
 * Displays the question followed by numbered options (1, 2, 3...).
 * User enters a number to select an option. Invalid input triggers re-prompt.
 * Ctrl+C or EOF returns a cancelled result.
 *
 * @template T - The type of values in the options array
 * @param rl - readline.Interface instance for input/output
 * @param question - Question text to display above options
 * @param options - Array of selectable options with labels and values
 * @returns Promise resolving to PromptResult with selected value or cancellation
 *
 * @example
 * ```typescript
 * const rl = createReadlineInterface();
 * const result = await promptSelect(rl, 'Select provider:', [
 *   { label: 'OpenAI', value: 'openai', description: 'GPT-4o' },
 *   { label: 'Anthropic', value: 'anthropic', description: 'Claude' },
 * ]);
 * rl.close();
 * ```
 */
export async function promptSelect<T>(
  rl: readline.Interface,
  question: string,
  options: PromptOption<T>[]
): Promise<PromptResult<T>> {
  // Print question and options with numbers
  console.log(`\n${question}`);
  options.forEach((opt, i) => {
    const desc = opt.description ? ` (${opt.description})` : '';
    console.log(`  ${i + 1}. ${opt.label}${desc}`);
  });

  // Read input
  try {
    const answer = await rl.question(`\nEnter choice [1-${options.length}]: `);

    // Parse selection
    const num = parseInt(answer.trim(), 10);
    const selectedOption = options[num - 1];
    if (num >= 1 && num <= options.length && selectedOption) {
      return { status: 'selected', value: selectedOption.value };
    }

    // Invalid input - re-prompt
    console.log('Invalid choice. Please enter a number.');
    return promptSelect(rl, question, options);
  } catch {
    // readline closed (Ctrl+C or EOF)
    return { status: 'cancelled' };
  }
}

/**
 * Prompt user for yes/no confirmation.
 *
 * Accepts: y, yes, Y, YES (true) or n, no, N, NO (false).
 * Empty input returns the default value based on `defaultNo` parameter.
 * Invalid input triggers re-prompt.
 *
 * @param rl - readline.Interface instance for input/output
 * @param question - Question text to display (e.g., "Overwrite file?")
 * @param defaultNo - If true, empty input returns false (default No);
 *                    if false, empty input returns true (default Yes)
 * @returns Promise resolving to true for yes, false for no
 *
 * @example
 * ```typescript
 * const overwrite = await promptConfirm(rl, 'File exists. Overwrite?', true);
 * // Shows: "File exists. Overwrite? [y/N]: "
 * // Empty input returns false (default No)
 * ```
 */
export async function promptConfirm(
  rl: readline.Interface,
  question: string,
  defaultNo = true
): Promise<boolean> {
  const hint = defaultNo ? '[y/N]' : '[Y/n]';

  try {
    const answer = await rl.question(`${question} ${hint}: `);

    // Empty input uses default
    if (answer.trim() === '') {
      return !defaultNo;
    }

    const lower = answer.toLowerCase().trim();
    if (['y', 'yes'].includes(lower)) return true;
    if (['n', 'no'].includes(lower)) return false;

    // Invalid input - re-prompt
    console.log('Please answer y or n.');
    return promptConfirm(rl, question, defaultNo);
  } catch {
    // readline closed - treat as default (usually No for destructive ops)
    return !defaultNo;
  }
}

/**
 * Create a readline interface for interactive prompts.
 *
 * Factory function that creates a readline.Interface configured for
 * standard input/output. Caller is responsible for calling `rl.close()`
 * when finished to properly release resources.
 *
 * @returns readline.Interface configured for stdin/stdout
 *
 * @example
 * ```typescript
 * const rl = createReadlineInterface();
 * try {
 *   const result = await promptSelect(rl, 'Select:', options);
 *   // ... use result
 * } finally {
 *   rl.close();
 * }
 * ```
 */
export function createReadlineInterface(): readline.Interface {
  return readline.createInterface({ input, output });
}
