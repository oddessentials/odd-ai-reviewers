/**
 * Interactive Prompts Unit Tests
 *
 * Feature 015: Config Wizard & Validation
 * Tests for readline-based interactive prompt utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable, Writable } from 'stream';
import * as readline from 'readline/promises';
import { promptSelect, promptConfirm, type PromptOption } from '../cli/interactive-prompts.js';

/**
 * Create a mock readline interface that provides predefined inputs.
 *
 * @param inputs - Array of strings to feed as user input
 * @returns readline.Interface configured with mock streams
 */
function createMockRl(inputs: string[]): readline.Interface {
  let inputIndex = 0;
  const mockInput = new Readable({
    read() {
      if (inputIndex < inputs.length) {
        this.push(inputs[inputIndex++] + '\n');
      } else {
        this.push(null);
      }
    },
  });
  const mockOutput = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  return readline.createInterface({ input: mockInput, output: mockOutput });
}

describe('promptSelect', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('returns selected value for valid numeric input', async () => {
    const rl = createMockRl(['2']);
    const options: PromptOption<string>[] = [
      { label: 'Option A', value: 'a' },
      { label: 'Option B', value: 'b' },
      { label: 'Option C', value: 'c' },
    ];

    const result = await promptSelect(rl, 'Pick one:', options);

    expect(result).toEqual({ status: 'selected', value: 'b' });
    rl.close();
  });

  it('returns first option for input "1"', async () => {
    const rl = createMockRl(['1']);
    const options: PromptOption<string>[] = [
      { label: 'First', value: 'first' },
      { label: 'Second', value: 'second' },
    ];

    const result = await promptSelect(rl, 'Select:', options);

    expect(result).toEqual({ status: 'selected', value: 'first' });
    rl.close();
  });

  it('returns last option for max valid input', async () => {
    const rl = createMockRl(['3']);
    const options: PromptOption<string>[] = [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
      { label: 'C', value: 'c' },
    ];

    const result = await promptSelect(rl, 'Choose:', options);

    expect(result).toEqual({ status: 'selected', value: 'c' });
    rl.close();
  });

  it('returns cancelled when invalid input exhausts stream', async () => {
    // When stream ends after invalid input without valid follow-up, returns cancelled
    const rl = createMockRl(['x']);
    const options: PromptOption<string>[] = [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
    ];

    const result = await promptSelect(rl, 'Pick:', options);

    // Invalid input causes console message, then stream ends = cancelled
    expect(consoleLogSpy).toHaveBeenCalledWith('Invalid choice. Please enter a number.');
    expect(result).toEqual({ status: 'cancelled' });
    rl.close();
  });

  it('returns cancelled when out-of-range input exhausts stream', async () => {
    // "5" is out of range for 3 options
    const rl = createMockRl(['5']);
    const options: PromptOption<string>[] = [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
      { label: 'C', value: 'c' },
    ];

    const result = await promptSelect(rl, 'Pick:', options);

    expect(consoleLogSpy).toHaveBeenCalledWith('Invalid choice. Please enter a number.');
    expect(result).toEqual({ status: 'cancelled' });
    rl.close();
  });

  it('handles options with descriptions', async () => {
    const rl = createMockRl(['1']);
    const options: PromptOption<string>[] = [
      { label: 'GitHub', value: 'github', description: 'GitHub.com or Enterprise' },
      { label: 'ADO', value: 'ado', description: 'Azure DevOps' },
    ];

    const result = await promptSelect(rl, 'Platform:', options);

    expect(result).toEqual({ status: 'selected', value: 'github' });
    // Verify descriptions are printed
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('GitHub.com or Enterprise'));
    rl.close();
  });
});

describe('promptConfirm', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('returns true for "y" input', async () => {
    const rl = createMockRl(['y']);

    const result = await promptConfirm(rl, 'Continue?');

    expect(result).toBe(true);
    rl.close();
  });

  it('returns true for "yes" input', async () => {
    const rl = createMockRl(['yes']);

    const result = await promptConfirm(rl, 'Continue?');

    expect(result).toBe(true);
    rl.close();
  });

  it('returns true for "Y" input (case insensitive)', async () => {
    const rl = createMockRl(['Y']);

    const result = await promptConfirm(rl, 'Continue?');

    expect(result).toBe(true);
    rl.close();
  });

  it('returns true for "YES" input (case insensitive)', async () => {
    const rl = createMockRl(['YES']);

    const result = await promptConfirm(rl, 'Continue?');

    expect(result).toBe(true);
    rl.close();
  });

  it('returns false for "n" input', async () => {
    const rl = createMockRl(['n']);

    const result = await promptConfirm(rl, 'Continue?');

    expect(result).toBe(false);
    rl.close();
  });

  it('returns false for "no" input', async () => {
    const rl = createMockRl(['no']);

    const result = await promptConfirm(rl, 'Continue?');

    expect(result).toBe(false);
    rl.close();
  });

  it('returns false for "N" input (case insensitive)', async () => {
    const rl = createMockRl(['N']);

    const result = await promptConfirm(rl, 'Continue?');

    expect(result).toBe(false);
    rl.close();
  });

  it('returns false for empty input when defaultNo=true', async () => {
    const rl = createMockRl(['']);

    const result = await promptConfirm(rl, 'Continue?', true);

    expect(result).toBe(false);
    rl.close();
  });

  it('returns true for empty input when defaultNo=false', async () => {
    const rl = createMockRl(['']);

    const result = await promptConfirm(rl, 'Continue?', false);

    expect(result).toBe(true);
    rl.close();
  });

  it('returns default when invalid input exhausts stream', async () => {
    // "maybe" is invalid, stream ends, returns default (false when defaultNo=true)
    const rl = createMockRl(['maybe']);

    const result = await promptConfirm(rl, 'Continue?', true);

    expect(consoleLogSpy).toHaveBeenCalledWith('Please answer y or n.');
    // When stream ends after invalid input, returns the default
    expect(result).toBe(false);
    rl.close();
  });
});
