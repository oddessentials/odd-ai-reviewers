/**
 * Tests for CLI color utilities
 */

import { describe, it, expect } from 'vitest';
import {
  ANSI,
  supportsColor,
  colorize,
  colorizeMulti,
  severityColor,
  colorizeSeverity,
  severityEmoji,
  severityLabel,
  createColorizer,
} from '../../../cli/output/colors.js';

describe('supportsColor', () => {
  describe('NO_COLOR environment variable', () => {
    it('disables colors when NO_COLOR is set to any value', () => {
      expect(supportsColor({ NO_COLOR: '1' }, true)).toBe(false);
      expect(supportsColor({ NO_COLOR: 'true' }, true)).toBe(false);
      expect(supportsColor({ NO_COLOR: '0' }, true)).toBe(false); // Any non-empty value
    });

    it('ignores empty NO_COLOR', () => {
      expect(supportsColor({ NO_COLOR: '' }, true)).toBe(true);
    });

    it('ignores undefined NO_COLOR', () => {
      expect(supportsColor({}, true)).toBe(true);
    });
  });

  describe('FORCE_COLOR environment variable', () => {
    it('enables colors when FORCE_COLOR is set', () => {
      expect(supportsColor({ FORCE_COLOR: '1' }, false)).toBe(true);
      expect(supportsColor({ FORCE_COLOR: 'true' }, false)).toBe(true);
    });

    it('ignores empty FORCE_COLOR', () => {
      expect(supportsColor({ FORCE_COLOR: '' }, false)).toBe(false);
    });

    it('NO_COLOR takes precedence over FORCE_COLOR', () => {
      expect(supportsColor({ NO_COLOR: '1', FORCE_COLOR: '1' }, true)).toBe(false);
    });
  });

  describe('TTY detection', () => {
    it('returns true when TTY is true and no env overrides', () => {
      expect(supportsColor({}, true)).toBe(true);
    });

    it('returns false when TTY is false and no env overrides', () => {
      expect(supportsColor({}, false)).toBe(false);
    });
  });
});

describe('colorize', () => {
  it('wraps text with ANSI codes when colored is true', () => {
    expect(colorize('hello', 'red', true)).toBe(`${ANSI.red}hello${ANSI.reset}`);
    expect(colorize('world', 'green', true)).toBe(`${ANSI.green}world${ANSI.reset}`);
  });

  it('returns plain text when colored is false', () => {
    expect(colorize('hello', 'red', false)).toBe('hello');
    expect(colorize('world', 'green', false)).toBe('world');
  });

  it('handles empty strings', () => {
    expect(colorize('', 'red', true)).toBe(`${ANSI.red}${ANSI.reset}`);
    expect(colorize('', 'red', false)).toBe('');
  });
});

describe('colorizeMulti', () => {
  it('applies multiple ANSI codes', () => {
    const result = colorizeMulti('test', ['bold', 'red'], true);
    expect(result).toBe(`${ANSI.bold}${ANSI.red}test${ANSI.reset}`);
  });

  it('returns plain text when colored is false', () => {
    expect(colorizeMulti('test', ['bold', 'red'], false)).toBe('test');
  });

  it('handles empty codes array', () => {
    expect(colorizeMulti('test', [], true)).toBe('test');
  });
});

describe('severityColor', () => {
  it('maps error to red', () => {
    expect(severityColor('error')).toBe('red');
  });

  it('maps warning to yellow', () => {
    expect(severityColor('warning')).toBe('yellow');
  });

  it('maps info to blue', () => {
    expect(severityColor('info')).toBe('blue');
  });
});

describe('colorizeSeverity', () => {
  it('colorizes text based on severity', () => {
    expect(colorizeSeverity('error message', 'error', true)).toBe(
      `${ANSI.red}error message${ANSI.reset}`
    );
    expect(colorizeSeverity('warning message', 'warning', true)).toBe(
      `${ANSI.yellow}warning message${ANSI.reset}`
    );
  });

  it('returns plain text when not colored', () => {
    expect(colorizeSeverity('error message', 'error', false)).toBe('error message');
  });
});

describe('severityEmoji', () => {
  it('returns correct emoji for each severity', () => {
    expect(severityEmoji('error')).toBe('🔴');
    expect(severityEmoji('warning')).toBe('🟡');
    expect(severityEmoji('info')).toBe('🔵');
  });
});

describe('severityLabel', () => {
  it('returns correct label for each severity', () => {
    expect(severityLabel('error')).toBe('[E]');
    expect(severityLabel('warning')).toBe('[W]');
    expect(severityLabel('info')).toBe('[I]');
  });
});

describe('createColorizer', () => {
  it('creates a colorizer with color support', () => {
    const c = createColorizer(true);
    expect(c.red('test')).toBe(`${ANSI.red}test${ANSI.reset}`);
    expect(c.bold('test')).toBe(`${ANSI.bold}test${ANSI.reset}`);
    expect(c.severity('test', 'error')).toBe(`${ANSI.red}test${ANSI.reset}`);
  });

  it('creates a colorizer without color support', () => {
    const c = createColorizer(false);
    expect(c.red('test')).toBe('test');
    expect(c.bold('test')).toBe('test');
    expect(c.severity('test', 'error')).toBe('test');
  });
});
