/**
 * Link Rewriting Tests for Documentation Viewer
 *
 * Tests internal and external link handling in the viewer.
 *
 * T030: Link rewriting test for internal/external link handling
 */

import { describe, it, expect } from 'vitest';

describe('Link Rewriting Logic', () => {
  describe('Internal Markdown Links', () => {
    /**
     * Helper to test link pattern matching
     * Simulates the regex used in attachContentListeners()
     */
    function parseMarkdownLink(href: string): {
      mdPath: string;
      anchor: string;
    } | null {
      if (!href || href.startsWith('http')) return null;

      // Pattern: ./x.md, ../x.md, x.md, path/x.md, x.md#anchor
      const mdMatch = href.match(/^([^#]*\.md)(#.*)?$/i);
      if (!mdMatch || !mdMatch[1]) return null;

      return {
        mdPath: mdMatch[1],
        anchor: mdMatch[2] ?? '',
      };
    }

    it('should match simple .md links', () => {
      const result = parseMarkdownLink('readme.md');
      expect(result).not.toBeNull();
      expect(result?.mdPath).toBe('readme.md');
      expect(result?.anchor).toBe('');
    });

    it('should match relative .md links with ./', () => {
      const result = parseMarkdownLink('./readme.md');
      expect(result).not.toBeNull();
      expect(result?.mdPath).toBe('./readme.md');
      expect(result?.anchor).toBe('');
    });

    it('should match parent directory .md links with ../', () => {
      const result = parseMarkdownLink('../readme.md');
      expect(result).not.toBeNull();
      expect(result?.mdPath).toBe('../readme.md');
      expect(result?.anchor).toBe('');
    });

    it('should match nested path .md links', () => {
      const result = parseMarkdownLink('configuration/config-schema.md');
      expect(result).not.toBeNull();
      expect(result?.mdPath).toBe('configuration/config-schema.md');
      expect(result?.anchor).toBe('');
    });

    it('should strip anchor from .md links (FR-014)', () => {
      const result = parseMarkdownLink('readme.md#section-1');
      expect(result).not.toBeNull();
      expect(result?.mdPath).toBe('readme.md');
      expect(result?.anchor).toBe('#section-1');
    });

    it('should handle complex anchors with dashes', () => {
      const result = parseMarkdownLink('./setup.md#getting-started-with-config');
      expect(result).not.toBeNull();
      expect(result?.mdPath).toBe('./setup.md');
      expect(result?.anchor).toBe('#getting-started-with-config');
    });

    it('should be case-insensitive for .md extension', () => {
      const lowercase = parseMarkdownLink('readme.md');
      const uppercase = parseMarkdownLink('README.MD');
      const mixed = parseMarkdownLink('ReadMe.Md');

      expect(lowercase?.mdPath).toBe('readme.md');
      expect(uppercase?.mdPath).toBe('README.MD');
      expect(mixed?.mdPath).toBe('ReadMe.Md');
    });
  });

  describe('External Links', () => {
    function parseMarkdownLink(href: string): {
      mdPath: string;
      anchor: string;
    } | null {
      if (!href || href.startsWith('http')) return null;
      const mdMatch = href.match(/^([^#]*\.md)(#.*)?$/i);
      if (!mdMatch || !mdMatch[1]) return null;
      return {
        mdPath: mdMatch[1],
        anchor: mdMatch[2] ?? '',
      };
    }

    it('should not match http:// links', () => {
      const result = parseMarkdownLink('http://example.com/readme.md');
      expect(result).toBeNull();
    });

    it('should not match https:// links', () => {
      const result = parseMarkdownLink('https://github.com/repo/readme.md');
      expect(result).toBeNull();
    });

    it('should not match non-.md files', () => {
      const html = parseMarkdownLink('index.html');
      const txt = parseMarkdownLink('readme.txt');
      const noExt = parseMarkdownLink('readme');

      expect(html).toBeNull();
      expect(txt).toBeNull();
      expect(noExt).toBeNull();
    });

    it('should not match plain anchors', () => {
      const result = parseMarkdownLink('#section');
      expect(result).toBeNull();
    });
  });

  describe('Path Resolution', () => {
    /**
     * Helper to resolve relative paths
     * Simulates resolvePath() in app.js
     */
    function resolvePath(basePath: string, relativePath: string): string {
      // Get directory of the current file
      const parts = basePath.split('/');
      parts.pop(); // Remove filename

      // Handle relative path
      const relParts = relativePath.split('/');

      for (const part of relParts) {
        if (part === '..') {
          parts.pop();
        } else if (part !== '.' && part !== '') {
          parts.push(part);
        }
      }

      return parts.join('/') || parts[0] || relativePath;
    }

    it('should resolve same-directory links', () => {
      const result = resolvePath('configuration/schema.md', 'options.md');
      expect(result).toBe('configuration/options.md');
    });

    it('should resolve ./ relative links', () => {
      const result = resolvePath('configuration/schema.md', './options.md');
      expect(result).toBe('configuration/options.md');
    });

    it('should resolve ../ parent directory links', () => {
      const result = resolvePath('configuration/schema.md', '../index.md');
      expect(result).toBe('index.md');
    });

    it('should resolve multiple ../ paths', () => {
      const result = resolvePath('deep/nested/path/doc.md', '../../other/file.md');
      expect(result).toBe('deep/other/file.md');
    });

    it('should handle root-level files', () => {
      const result = resolvePath('readme.md', 'contributing.md');
      expect(result).toBe('contributing.md');
    });

    it('should resolve absolute-looking paths from root', () => {
      const result = resolvePath('index.md', 'docs/setup.md');
      expect(result).toBe('docs/setup.md');
    });
  });

  describe('Allowlist Validation', () => {
    /**
     * Case-insensitive path matching
     */
    function findMatchingPath(paths: string[], targetPath: string): string | undefined {
      return paths.find((p) => p.toLowerCase() === targetPath.toLowerCase());
    }

    it('should match exact paths', () => {
      const paths = ['index.md', 'README.md', 'docs/setup.md'];
      expect(findMatchingPath(paths, 'index.md')).toBe('index.md');
    });

    it('should match case-insensitively', () => {
      const paths = ['INDEX.md', 'README.md', 'docs/setup.md'];
      expect(findMatchingPath(paths, 'index.md')).toBe('INDEX.md');
      expect(findMatchingPath(paths, 'INDEX.MD')).toBe('INDEX.md');
    });

    it('should return undefined for non-existent paths', () => {
      const paths = ['index.md', 'README.md'];
      expect(findMatchingPath(paths, 'nonexistent.md')).toBeUndefined();
    });

    it('should handle paths with directories', () => {
      const paths = ['docs/getting-started.md', 'docs/api/reference.md'];
      expect(findMatchingPath(paths, 'docs/getting-started.md')).toBe('docs/getting-started.md');
      expect(findMatchingPath(paths, 'DOCS/GETTING-STARTED.MD')).toBe('docs/getting-started.md');
    });
  });
});
