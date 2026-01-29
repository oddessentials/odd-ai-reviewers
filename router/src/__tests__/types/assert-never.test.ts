/**
 * assertNever Utility Tests (T077)
 *
 * Tests for exhaustive switch enforcement utility
 */

import { describe, it, expect } from 'vitest';
import { assertNever } from '../../types/assert-never.js';

describe('assertNever', () => {
  it('throws with default message for unexpected value', () => {
    // Cast to never to test runtime behavior
    const unexpectedValue = 'unexpected' as never;

    expect(() => assertNever(unexpectedValue)).toThrow('Unexpected value: "unexpected"');
  });

  it('throws with custom message when provided', () => {
    const unexpectedValue = 42 as never;

    expect(() => assertNever(unexpectedValue, 'Custom error message')).toThrow(
      'Custom error message'
    );
  });

  it('stringifies objects in default message', () => {
    const unexpectedValue = { type: 'unknown' } as never;

    expect(() => assertNever(unexpectedValue)).toThrow('Unexpected value: {"type":"unknown"}');
  });

  it('handles null value', () => {
    const unexpectedValue = null as never;

    expect(() => assertNever(unexpectedValue)).toThrow('Unexpected value: null');
  });

  it('enables exhaustive switch checking', () => {
    type Status = 'pending' | 'active' | 'completed';

    function handleStatus(status: Status): string {
      switch (status) {
        case 'pending':
          return 'Waiting';
        case 'active':
          return 'In progress';
        case 'completed':
          return 'Done';
        default:
          // This ensures all cases are handled at compile time
          return assertNever(status);
      }
    }

    expect(handleStatus('pending')).toBe('Waiting');
    expect(handleStatus('active')).toBe('In progress');
    expect(handleStatus('completed')).toBe('Done');
  });

  it('catches missing cases at runtime when cast incorrectly', () => {
    type Color = 'red' | 'green' | 'blue';

    function colorToHex(color: Color): string {
      switch (color) {
        case 'red':
          return '#ff0000';
        case 'green':
          return '#00ff00';
        case 'blue':
          return '#0000ff';
        default:
          return assertNever(color);
      }
    }

    // Normal usage works
    expect(colorToHex('red')).toBe('#ff0000');

    // Simulate a runtime error from bad data (e.g., from API)
    const badColor = 'yellow' as Color;
    expect(() => colorToHex(badColor)).toThrow('Unexpected value: "yellow"');
  });
});
