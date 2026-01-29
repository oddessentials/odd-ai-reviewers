/**
 * Metadata Helpers Tests (T014)
 *
 * Tests for typed metadata extraction functions.
 * Part of 011-agent-result-unions feature (FR-007, FR-008).
 */

import { describe, it, expect } from 'vitest';
import { getSecurityMetadata, getKnownEnv, type KnownEnvVars } from '../../agents/metadata.js';

describe('getSecurityMetadata', () => {
  describe('extracts valid metadata fields', () => {
    it('extracts all known security fields', () => {
      const finding = {
        metadata: {
          cwe: 'CWE-79',
          owasp: 'A03:2021-Injection',
          confidence: 'high',
          cveId: 'CVE-2024-1234',
        },
      };

      const result = getSecurityMetadata(finding);

      expect(result.cwe).toBe('CWE-79');
      expect(result.owasp).toBe('A03:2021-Injection');
      expect(result.confidence).toBe('high');
      expect(result.cveId).toBe('CVE-2024-1234');
    });

    it('extracts partial metadata', () => {
      const finding = {
        metadata: {
          cwe: 'CWE-89',
          confidence: 'medium',
        },
      };

      const result = getSecurityMetadata(finding);

      expect(result.cwe).toBe('CWE-89');
      expect(result.confidence).toBe('medium');
      expect(result.owasp).toBeUndefined();
      expect(result.cveId).toBeUndefined();
    });
  });

  describe('handles missing or empty metadata', () => {
    it('returns empty object for undefined metadata', () => {
      const finding = {};

      const result = getSecurityMetadata(finding);

      expect(result.cwe).toBeUndefined();
      expect(result.owasp).toBeUndefined();
      expect(result.confidence).toBeUndefined();
      expect(result.cveId).toBeUndefined();
    });

    it('returns empty object for empty metadata', () => {
      const finding = { metadata: {} };

      const result = getSecurityMetadata(finding);

      expect(result.cwe).toBeUndefined();
      expect(result.owasp).toBeUndefined();
      expect(result.confidence).toBeUndefined();
      expect(result.cveId).toBeUndefined();
    });
  });

  describe('filters invalid types', () => {
    it('ignores non-string cwe', () => {
      const finding = {
        metadata: {
          cwe: 79, // number instead of string
          owasp: 'A03:2021-Injection',
        },
      };

      const result = getSecurityMetadata(finding);

      expect(result.cwe).toBeUndefined();
      expect(result.owasp).toBe('A03:2021-Injection');
    });

    it('ignores non-string owasp', () => {
      const finding = {
        metadata: {
          owasp: { category: 'A03' }, // object instead of string
        },
      };

      const result = getSecurityMetadata(finding);

      expect(result.owasp).toBeUndefined();
    });

    it('ignores invalid confidence values', () => {
      const finding = {
        metadata: {
          confidence: 'very-high', // not in allowed values
        },
      };

      const result = getSecurityMetadata(finding);

      expect(result.confidence).toBeUndefined();
    });

    it('ignores null cveId', () => {
      const finding = {
        metadata: {
          cveId: null,
        },
      };

      const result = getSecurityMetadata(finding);

      expect(result.cveId).toBeUndefined();
    });
  });

  describe('validates confidence values', () => {
    it('accepts high confidence', () => {
      const finding = { metadata: { confidence: 'high' } };
      expect(getSecurityMetadata(finding).confidence).toBe('high');
    });

    it('accepts medium confidence', () => {
      const finding = { metadata: { confidence: 'medium' } };
      expect(getSecurityMetadata(finding).confidence).toBe('medium');
    });

    it('accepts low confidence', () => {
      const finding = { metadata: { confidence: 'low' } };
      expect(getSecurityMetadata(finding).confidence).toBe('low');
    });

    it('rejects unknown confidence values', () => {
      const finding = { metadata: { confidence: 'critical' } };
      expect(getSecurityMetadata(finding).confidence).toBeUndefined();
    });
  });

  describe('ignores unknown metadata fields', () => {
    it('does not include unknown fields in result', () => {
      const finding = {
        metadata: {
          cwe: 'CWE-79',
          unknownField: 'value',
          anotherField: 123,
        },
      };

      const result = getSecurityMetadata(finding);

      expect(result.cwe).toBe('CWE-79');
      expect('unknownField' in result).toBe(false);
      expect('anotherField' in result).toBe(false);
    });
  });
});

describe('getKnownEnv', () => {
  describe('extracts known environment variables', () => {
    it('extracts all known env vars', () => {
      const env = {
        GITHUB_TOKEN: 'gh_token_123',
        AZURE_DEVOPS_PAT: 'ado_pat_456',
        SYSTEM_ACCESSTOKEN: 'system_token_789',
        ANTHROPIC_API_KEY: 'sk-ant-key',
        OPENAI_API_KEY: 'sk-openai-key',
        AZURE_OPENAI_API_KEY: 'azure-oai-key',
      };

      const result = getKnownEnv(env);

      expect(result.GITHUB_TOKEN).toBe('gh_token_123');
      expect(result.AZURE_DEVOPS_PAT).toBe('ado_pat_456');
      expect(result.SYSTEM_ACCESSTOKEN).toBe('system_token_789');
      expect(result.ANTHROPIC_API_KEY).toBe('sk-ant-key');
      expect(result.OPENAI_API_KEY).toBe('sk-openai-key');
      expect(result.AZURE_OPENAI_API_KEY).toBe('azure-oai-key');
    });

    it('extracts partial env vars', () => {
      const env = {
        GITHUB_TOKEN: 'gh_token_123',
        ANTHROPIC_API_KEY: 'sk-ant-key',
      };

      const result = getKnownEnv(env);

      expect(result.GITHUB_TOKEN).toBe('gh_token_123');
      expect(result.ANTHROPIC_API_KEY).toBe('sk-ant-key');
      expect(result.AZURE_DEVOPS_PAT).toBeUndefined();
      expect(result.OPENAI_API_KEY).toBeUndefined();
    });
  });

  describe('handles empty environment', () => {
    it('returns all undefined for empty env', () => {
      const env: Record<string, string | undefined> = {};

      const result = getKnownEnv(env);

      expect(result.GITHUB_TOKEN).toBeUndefined();
      expect(result.AZURE_DEVOPS_PAT).toBeUndefined();
      expect(result.SYSTEM_ACCESSTOKEN).toBeUndefined();
      expect(result.ANTHROPIC_API_KEY).toBeUndefined();
      expect(result.OPENAI_API_KEY).toBeUndefined();
      expect(result.AZURE_OPENAI_API_KEY).toBeUndefined();
    });
  });

  describe('handles undefined values', () => {
    it('preserves undefined values', () => {
      const env = {
        GITHUB_TOKEN: undefined,
        ANTHROPIC_API_KEY: 'sk-ant-key',
      };

      const result = getKnownEnv(env);

      expect(result.GITHUB_TOKEN).toBeUndefined();
      expect(result.ANTHROPIC_API_KEY).toBe('sk-ant-key');
    });
  });

  describe('ignores unknown env vars', () => {
    it('does not include unknown env vars in result', () => {
      const env = {
        GITHUB_TOKEN: 'gh_token_123',
        MY_CUSTOM_VAR: 'custom_value',
        ANOTHER_VAR: 'another_value',
      };

      const result = getKnownEnv(env);

      expect(result.GITHUB_TOKEN).toBe('gh_token_123');
      expect('MY_CUSTOM_VAR' in result).toBe(false);
      expect('ANOTHER_VAR' in result).toBe(false);
    });
  });

  describe('type safety', () => {
    it('result has correct type shape', () => {
      const env = {
        GITHUB_TOKEN: 'token',
      };

      const result: KnownEnvVars = getKnownEnv(env);

      // TypeScript ensures only known keys are accessible
      // These lines compile because these are known keys
      const _ghToken: string | undefined = result.GITHUB_TOKEN;
      const _adoPat: string | undefined = result.AZURE_DEVOPS_PAT;
      const _anthropicKey: string | undefined = result.ANTHROPIC_API_KEY;

      expect(_ghToken).toBe('token');
      expect(_adoPat).toBeUndefined();
      expect(_anthropicKey).toBeUndefined();
    });
  });
});

describe('Integration: Using metadata helpers with findings', () => {
  it('extracts security metadata from a finding with full metadata', () => {
    const finding = {
      severity: 'error' as const,
      file: 'src/auth.ts',
      line: 42,
      message: 'SQL injection vulnerability',
      sourceAgent: 'security-scanner',
      metadata: {
        cwe: 'CWE-89',
        owasp: 'A03:2021-Injection',
        confidence: 'high' as const,
        cveId: 'CVE-2024-5678',
        // Additional tool-specific metadata (ignored)
        severity_score: 9.8,
        tool_name: 'security-scanner',
      },
    };

    const securityMeta = getSecurityMetadata(finding);

    expect(securityMeta).toEqual({
      cwe: 'CWE-89',
      owasp: 'A03:2021-Injection',
      confidence: 'high',
      cveId: 'CVE-2024-5678',
    });
  });

  it('handles finding with mixed valid and invalid metadata', () => {
    const finding = {
      severity: 'warning' as const,
      file: 'src/api.ts',
      message: 'Potential XSS',
      sourceAgent: 'xss-detector',
      metadata: {
        cwe: 'CWE-79', // valid
        confidence: 'very-high', // invalid - not in allowed values
        severity_score: 'high', // not a security metadata field
      },
    };

    const securityMeta = getSecurityMetadata(finding);

    expect(securityMeta.cwe).toBe('CWE-79');
    expect(securityMeta.confidence).toBeUndefined(); // filtered out
    expect(securityMeta.owasp).toBeUndefined();
  });
});
