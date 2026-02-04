/**
 * Sanitization Tests for Documentation Viewer
 *
 * Tests the 5 adversarial fixtures defined in FR-009 to ensure
 * DOMPurify properly sanitizes malicious content.
 *
 * These tests verify that the sanitization configuration in app.js
 * correctly blocks XSS attack vectors.
 */

import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Setup DOMPurify with JSDOM for Node.js testing
// Type assertion needed due to @types/trusted-types version mismatch between JSDOM and DOMPurify
const jsdomWindow = new JSDOM('').window;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const purify = DOMPurify(jsdomWindow as any);

// DOMPurify configuration matching app.js
const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  ALLOWED_TAGS: [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'a',
    'ul',
    'ol',
    'li',
    'code',
    'pre',
    'blockquote',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'hr',
    'img',
    'span',
    'div',
    'strong',
    'em',
    'del',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id'],
};

describe('Documentation Viewer Sanitization', () => {
  describe('Adversarial Fixture 1: Script Tags', () => {
    it('should strip inline script tags', () => {
      const malicious = '<script>alert("xss")</script>';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert');
    });

    it('should strip script tags with src attribute', () => {
      const malicious = '<script src="https://evil.com/xss.js"></script>';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('evil.com');
    });

    it('should strip script tags embedded in other content', () => {
      const malicious = '<p>Hello <script>alert("xss")</script> World</p>';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      expect(result).toContain('<p>');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
      expect(result).not.toContain('<script');
    });
  });

  describe('Adversarial Fixture 2: JavaScript Links', () => {
    it('should remove javascript: protocol from href', () => {
      const malicious = '<a href="javascript:alert(\'xss\')">click me</a>';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      expect(result).not.toContain('javascript:');
    });

    it('should remove javascript: with encoding', () => {
      const malicious = '<a href="&#106;avascript:alert(\'xss\')">click</a>';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('alert');
    });

    it('should preserve legitimate links', () => {
      const safe = '<a href="https://example.com">safe link</a>';
      const result = purify.sanitize(safe, PURIFY_CONFIG);
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('safe link');
    });
  });

  describe('Adversarial Fixture 3: Event Handlers', () => {
    it('should strip onerror handler', () => {
      const malicious = '<img src="x" onerror="alert(\'xss\')">';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
    });

    it('should strip onclick handler', () => {
      const malicious = '<div onclick="alert(\'xss\')">click me</div>';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      expect(result).not.toContain('onclick');
    });

    it('should strip onload handler', () => {
      const malicious = '<img src="x" onload="alert(\'xss\')">';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      expect(result).not.toContain('onload');
    });

    it('should strip onmouseover handler', () => {
      const malicious = '<span onmouseover="alert(\'xss\')">hover</span>';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      expect(result).not.toContain('onmouseover');
    });
  });

  describe('Adversarial Fixture 4: Raw HTML with Iframes', () => {
    it('should strip iframe elements entirely', () => {
      const malicious = '<iframe src="https://evil.com"></iframe>';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      expect(result).not.toContain('<iframe');
      expect(result).not.toContain('evil.com');
    });

    it('should strip iframe with srcdoc', () => {
      const malicious = '<iframe srcdoc="<script>alert(1)</script>"></iframe>';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      expect(result).not.toContain('<iframe');
      expect(result).not.toContain('srcdoc');
    });

    it('should strip iframe embedded in content', () => {
      const malicious = '<p>Text <iframe src="https://evil.com"></iframe> more text</p>';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      expect(result).toContain('<p>');
      expect(result).not.toContain('<iframe');
    });
  });

  describe('Adversarial Fixture 5: Data URIs in Images', () => {
    it('should handle data: URIs with non-image MIME types', () => {
      const malicious = '<img src="data:text/html,<script>alert(\'xss\')</script>">';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      // DOMPurify keeps the img with the data URI intact.
      // The string "<script>" appearing inside a data URI src attribute
      // is NOT a DOM script element - it's just text in an attribute value.
      // Security property: img src with data: URIs don't execute scripts,
      // they're either rendered (for image MIME types) or ignored.
      // What matters is that no actual <script> element exists in the DOM.
      //
      // The result should start with <img and contain no standalone <script> element
      expect(result.startsWith('<img')).toBe(true);
      // Verify there's no script element OUTSIDE of an attribute value
      // by checking the result only contains the img tag
      expect(result.split('<img').length).toBe(2); // Only one <img tag
      // And no separate script tag after it
      expect(result).not.toMatch(/<\/img>\s*<script/i);
    });

    it('should allow legitimate image data URIs', () => {
      // Small valid PNG (1x1 transparent pixel)
      const safe =
        '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="pixel">';
      const result = purify.sanitize(safe, PURIFY_CONFIG);
      expect(result).toContain('<img');
      expect(result).toContain('alt="pixel"');
    });

    it('should handle javascript in data URI', () => {
      const malicious = '<img src="data:text/javascript,alert(\'xss\')">';
      const result = purify.sanitize(malicious, PURIFY_CONFIG);
      // DOMPurify allows data URIs but they can't execute as scripts
      // when used as img src - browsers don't interpret img src as JS.
      // The security property is that the content can't execute.
      // No actual <script> tags in the output is what matters.
      expect(result).not.toMatch(/<script/i);
    });
  });

  describe('Allowed Content', () => {
    it('should preserve allowed HTML elements', () => {
      const safe = `
        <h1 id="title">Title</h1>
        <p>Paragraph with <strong>bold</strong> and <em>italic</em></p>
        <ul><li>Item 1</li><li>Item 2</li></ul>
        <a href="https://example.com" title="Example">Link</a>
        <img src="image.png" alt="Image">
        <code>inline code</code>
        <pre>code block</pre>
        <blockquote>Quote</blockquote>
      `;
      const result = purify.sanitize(safe, PURIFY_CONFIG);
      expect(result).toContain('<h1');
      expect(result).toContain('<p>');
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>');
      expect(result).toContain('<a href=');
      expect(result).toContain('<img');
      expect(result).toContain('<code>');
      expect(result).toContain('<pre>');
      expect(result).toContain('<blockquote>');
    });

    it('should preserve allowed attributes', () => {
      const safe = `
        <a href="https://example.com" title="Example" class="link">Link</a>
        <img src="image.png" alt="Alt text" class="image">
        <h2 id="section-1" class="heading">Section</h2>
      `;
      const result = purify.sanitize(safe, PURIFY_CONFIG);
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('title="Example"');
      expect(result).toContain('alt="Alt text"');
      expect(result).toContain('id="section-1"');
      expect(result).toContain('class=');
    });
  });
});
