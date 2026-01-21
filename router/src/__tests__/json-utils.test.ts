/**
 * Unit tests for JSON utilities
 */

import { describe, it, expect } from 'vitest';
import { stripJsonCodeFences, parseJsonResponse } from '../agents/json-utils.js';

describe('stripJsonCodeFences', () => {
  it('should return raw JSON unchanged', () => {
    const json = '{"findings": []}';
    expect(stripJsonCodeFences(json)).toBe(json);
  });

  it('should strip ```json ... ``` fences', () => {
    const fenced = '```json\n{"findings": []}\n```';
    expect(stripJsonCodeFences(fenced)).toBe('{"findings": []}');
  });

  it('should strip ``` ... ``` fences (no language tag)', () => {
    const fenced = '```\n{"findings": []}\n```';
    expect(stripJsonCodeFences(fenced)).toBe('{"findings": []}');
  });

  it('should handle whitespace around fences', () => {
    const fenced = '  ```json\n  {"findings": []}\n  ```  ';
    expect(stripJsonCodeFences(fenced)).toBe('{"findings": []}');
  });

  it('should preserve inner code blocks (surgical behavior)', () => {
    const withInner = '```json\n{"code": "```nested```"}\n```';
    const result = stripJsonCodeFences(withInner);
    expect(result).toBe('{"code": "```nested```"}');
  });

  it('should handle multiline JSON content', () => {
    const fenced = '```json\n{\n  "findings": [\n    {"severity": "high"}\n  ]\n}\n```';
    const result = stripJsonCodeFences(fenced);
    expect(result).toContain('"findings"');
    expect(result).toContain('"severity"');
  });

  it('should return malformed content unchanged (opening fence, no closing)', () => {
    const malformed = '```json\n{"findings": []}';
    expect(stripJsonCodeFences(malformed)).toBe(malformed);
  });

  it('should return content with no opening fence unchanged', () => {
    const noOpening = '{"findings": []}\n```';
    expect(stripJsonCodeFences(noOpening)).toBe(noOpening.trim());
  });
});

describe('parseJsonResponse', () => {
  it('should parse raw JSON', () => {
    const json = '{"findings": []}';
    const result = parseJsonResponse(json, 'Test');
    expect(result).toEqual({ findings: [] });
  });

  it('should parse fenced JSON', () => {
    const fenced = '```json\n{"findings": []}\n```';
    const result = parseJsonResponse(fenced, 'Anthropic');
    expect(result).toEqual({ findings: [] });
  });

  it('should throw descriptive error for invalid JSON', () => {
    const invalid = '```json\nnot valid json\n```';
    expect(() => parseJsonResponse(invalid, 'Anthropic')).toThrow(
      /Failed to parse Anthropic response as JSON/
    );
  });

  it('should include content preview in error message', () => {
    const invalid = '```json\nthis is not json\n```';
    expect(() => parseJsonResponse(invalid, 'Test')).toThrow(/this is not json/);
  });

  it('should throw for empty content', () => {
    expect(() => parseJsonResponse('', 'Test')).toThrow();
  });

  it('should throw for whitespace-only content', () => {
    expect(() => parseJsonResponse('   \n   ', 'Test')).toThrow();
  });
});
