/**
 * Tests for CLI Colors Module
 *
 * Tests T013-T015: NO_COLOR, FORCE_COLOR, and TTY detection
 */

import { describe, it, expect } from 'vitest';
import {
  ANSI,
  supportsColor,
  colorize,
  colorizeMulti,
  getSeverityColor,
  colorizeSeverity,
  formatSeverityLabel,
  createColorizer,
  stripAnsi,
  visibleLength,
} from '../../../../src/cli/output/colors.js';

describe('colors', () => {
  describe('ANSI constants', () => {
    it('should export reset code', () => {
      expect(ANSI.reset).toBe('\x1b[0m');
    });

    it('should export color codes', () => {
      expect(ANSI.red).toBe('\x1b[31m');
      expect(ANSI.green).toBe('\x1b[32m');
      expect(ANSI.yellow).toBe('\x1b[33m');
      expect(ANSI.blue).toBe('\x1b[34m');
      expect(ANSI.gray).toBe('\x1b[90m');
    });

    it('should export formatting codes', () => {
      expect(ANSI.bold).toBe('\x1b[1m');
      expect(ANSI.dim).toBe('\x1b[2m');
      expect(ANSI.inverse).toBe('\x1b[7m');
    });
  });

  describe('supportsColor', () => {
    describe('NO_COLOR tests (T013)', () => {
      it('should return false when NO_COLOR is set to any value', () => {
        expect(supportsColor({ NO_COLOR: '1' }, true)).toBe(false);
        expect(supportsColor({ NO_COLOR: '' }, true)).toBe(false);
        expect(supportsColor({ NO_COLOR: 'false' }, true)).toBe(false);
      });

      it('should return false when NO_COLOR is set even with FORCE_COLOR', () => {
        expect(supportsColor({ NO_COLOR: '1', FORCE_COLOR: '1' }, true)).toBe(false);
      });

      it('should return true when NO_COLOR is not set and TTY is true', () => {
        expect(supportsColor({}, true)).toBe(true);
      });
    });

    describe('FORCE_COLOR tests (T014)', () => {
      it('should return true when FORCE_COLOR is set', () => {
        expect(supportsColor({ FORCE_COLOR: '1' }, false)).toBe(true);
        expect(supportsColor({ FORCE_COLOR: '' }, false)).toBe(true);
        expect(supportsColor({ FORCE_COLOR: 'true' }, false)).toBe(true);
      });

      it('should return true when FORCE_COLOR is set even without TTY', () => {
        expect(supportsColor({ FORCE_COLOR: '1' }, false)).toBe(true);
      });

      it('should be overridden by NO_COLOR', () => {
        expect(supportsColor({ FORCE_COLOR: '1', NO_COLOR: '1' }, true)).toBe(false);
      });
    });

    describe('TTY detection tests (T015)', () => {
      it('should return true when TTY is true and no env overrides', () => {
        expect(supportsColor({}, true)).toBe(true);
      });

      it('should return false when TTY is false and no env overrides', () => {
        expect(supportsColor({}, false)).toBe(false);
      });
    });
  });

  describe('colorize', () => {
    it('should apply color code when colored is true', () => {
      const result = colorize('hello', ANSI.red, true);
      expect(result).toBe('\x1b[31mhello\x1b[0m');
    });

    it('should return plain text when colored is false', () => {
      const result = colorize('hello', ANSI.red, false);
      expect(result).toBe('hello');
    });

    it('should handle empty strings', () => {
      const result = colorize('', ANSI.red, true);
      expect(result).toBe('\x1b[31m\x1b[0m');
    });
  });

  describe('colorizeMulti', () => {
    it('should apply multiple codes', () => {
      const result = colorizeMulti('hello', [ANSI.bold, ANSI.red], true);
      expect(result).toBe('\x1b[1m\x1b[31mhello\x1b[0m');
    });

    it('should return plain text when colored is false', () => {
      const result = colorizeMulti('hello', [ANSI.bold, ANSI.red], false);
      expect(result).toBe('hello');
    });

    it('should return plain text when codes array is empty', () => {
      const result = colorizeMulti('hello', [], true);
      expect(result).toBe('hello');
    });
  });

  describe('severity colors', () => {
    it('should return red for error severity', () => {
      expect(getSeverityColor('error')).toBe(ANSI.red);
    });

    it('should return yellow for warning severity', () => {
      expect(getSeverityColor('warning')).toBe(ANSI.yellow);
    });

    it('should return blue for info severity', () => {
      expect(getSeverityColor('info')).toBe(ANSI.blue);
    });
  });

  describe('colorizeSeverity', () => {
    it('should colorize error text in red', () => {
      const result = colorizeSeverity('problem', 'error', true);
      expect(result).toBe('\x1b[31mproblem\x1b[0m');
    });

    it('should colorize warning text in yellow', () => {
      const result = colorizeSeverity('warning', 'warning', true);
      expect(result).toBe('\x1b[33mwarning\x1b[0m');
    });

    it('should return plain text when colored is false', () => {
      const result = colorizeSeverity('info', 'info', false);
      expect(result).toBe('info');
    });
  });

  describe('formatSeverityLabel', () => {
    it('should format error label with red color', () => {
      const result = formatSeverityLabel('error', true);
      expect(result).toContain('\x1b[31m');
      expect(result).toContain('error');
    });

    it('should return plain label when colors disabled', () => {
      const result = formatSeverityLabel('warning', false);
      expect(result).toBe('warning');
    });
  });

  describe('createColorizer', () => {
    it('should create colorizer with all color methods', () => {
      const c = createColorizer(true);
      expect(typeof c.red).toBe('function');
      expect(typeof c.green).toBe('function');
      expect(typeof c.yellow).toBe('function');
      expect(typeof c.blue).toBe('function');
      expect(typeof c.bold).toBe('function');
      expect(typeof c.error).toBe('function');
      expect(typeof c.warning).toBe('function');
      expect(typeof c.info).toBe('function');
    });

    it('should apply colors when enabled', () => {
      const c = createColorizer(true);
      expect(c.red('test')).toBe('\x1b[31mtest\x1b[0m');
    });

    it('should return plain text when disabled', () => {
      const c = createColorizer(false);
      expect(c.red('test')).toBe('test');
    });
  });

  describe('stripAnsi', () => {
    it('should remove ANSI codes from text', () => {
      const colored = '\x1b[31mhello\x1b[0m \x1b[1mworld\x1b[0m';
      const result = stripAnsi(colored);
      expect(result).toBe('hello world');
    });

    it('should handle text without ANSI codes', () => {
      const result = stripAnsi('plain text');
      expect(result).toBe('plain text');
    });

    it('should handle empty string', () => {
      const result = stripAnsi('');
      expect(result).toBe('');
    });
  });

  describe('visibleLength', () => {
    it('should return length excluding ANSI codes', () => {
      const colored = '\x1b[31mhello\x1b[0m';
      expect(visibleLength(colored)).toBe(5);
    });

    it('should return actual length for plain text', () => {
      expect(visibleLength('hello')).toBe(5);
    });

    it('should handle multiple ANSI codes', () => {
      const colored = '\x1b[1m\x1b[31mtest\x1b[0m';
      expect(visibleLength(colored)).toBe(4);
    });
  });
});
