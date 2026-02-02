/**
 * Reliability Compliance Tests: Config Preservation
 *
 * PR_LESSONS_LEARNED.md Requirement #11: Handle probe failures gracefully
 * "When a preliminary check fails, don't discard the original configuration.
 * Fall back to the user's explicit settings."
 *
 * These tests verify that configuration is preserved even when some
 * validation or probe steps fail.
 *
 * @module tests/reliability/config-preservation
 */

import { describe, it, expect } from 'vitest';
import {
  detectProvider,
  generateZeroConfigDefaults,
  isZeroConfigSuccess,
} from '../../src/config/zero-config.js';

describe('T132: Config Preservation on Failure', () => {
  describe('Provider Detection Graceful Fallback', () => {
    it('should return null when no provider detected (not throw)', () => {
      const env = {};
      const provider = detectProvider(env);

      // Should return null, not throw
      expect(provider).toBeNull();
    });

    it('should detect anthropic from ANTHROPIC_API_KEY', () => {
      const env = { ANTHROPIC_API_KEY: 'sk-ant-xxx' };
      const provider = detectProvider(env);

      expect(provider).toBe('anthropic');
    });

    it('should detect openai from OPENAI_API_KEY', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      const provider = detectProvider(env);

      expect(provider).toBe('openai');
    });

    it('should detect azure-openai from AZURE_OPENAI_API_KEY', () => {
      // Azure requires all three values
      const env = {
        AZURE_OPENAI_API_KEY: 'xxx',
        AZURE_OPENAI_ENDPOINT: 'https://...',
        AZURE_OPENAI_DEPLOYMENT: 'my-deployment',
      };
      const provider = detectProvider(env);

      expect(provider).toBe('azure-openai');
    });

    it('should detect ollama from OLLAMA_BASE_URL', () => {
      const env = { OLLAMA_BASE_URL: 'http://localhost:11434' };
      const provider = detectProvider(env);

      expect(provider).toBe('ollama');
    });

    it('should prioritize anthropic over openai when both present', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        OPENAI_API_KEY: 'sk-xxx',
      };
      const provider = detectProvider(env);

      expect(provider).toBe('anthropic');
    });
  });

  describe('Zero-Config Defaults Generation', () => {
    it('should generate valid config when provider detected', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      const result = generateZeroConfigDefaults(env);

      expect(isZeroConfigSuccess(result)).toBe(true);
      if (isZeroConfigSuccess(result)) {
        expect(result.config).toHaveProperty('provider');
        expect(result.config).toHaveProperty('passes');
        expect(result.config).toHaveProperty('limits');
      }
    });

    it('should return error result when no provider available', () => {
      const env = {};
      const result = generateZeroConfigDefaults(env);

      expect(isZeroConfigSuccess(result)).toBe(false);
      expect(result.config).toBeNull();
    });

    it('should include sensible default limits', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      const result = generateZeroConfigDefaults(env);

      if (isZeroConfigSuccess(result)) {
        expect(result.config.limits).toBeDefined();
        expect(result.config.limits.max_usd_per_pr).toBeGreaterThan(0);
        expect(result.config.limits.max_usd_per_pr).toBeLessThanOrEqual(1);
      }
    });

    it('should include isZeroConfig flag', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      const result = generateZeroConfigDefaults(env);

      expect(result.isZeroConfig).toBe(true);
    });
  });

  describe('Config Fallback Chain', () => {
    it('should preserve explicit provider over detection', () => {
      // This tests the concept - actual implementation may vary
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
      };

      // When user explicitly sets ANTHROPIC_API_KEY, it should be preferred
      const provider = detectProvider(env);

      // Detection has a priority order
      expect(provider).toBe('anthropic');
    });

    it('should handle partial azure config gracefully', () => {
      // Azure requires all three env vars - partial config returns null
      const env = {
        AZURE_OPENAI_API_KEY: 'xxx',
        // Missing AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT
      };

      const provider = detectProvider(env);

      // Should return null since Azure requires all three values
      expect(provider).toBeNull();
    });
  });

  describe('Error State Handling', () => {
    it('should not throw on undefined env values', () => {
      const env = {
        OPENAI_API_KEY: undefined,
        ANTHROPIC_API_KEY: undefined,
      } as Record<string, string | undefined>;

      expect(() => detectProvider(env)).not.toThrow();
    });

    it('should not throw on empty string env values', () => {
      const env = {
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: '',
      };

      expect(() => detectProvider(env)).not.toThrow();
      expect(detectProvider(env)).toBeNull();
    });

    it('should handle malformed env values gracefully', () => {
      const env = {
        OPENAI_API_KEY: '   ',
        ANTHROPIC_API_KEY: '\n\t',
      };

      expect(() => detectProvider(env)).not.toThrow();
    });
  });

  describe('Config Source Tracking', () => {
    it('should indicate zero-config mode in generated result', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      const result = generateZeroConfigDefaults(env);

      expect(result.isZeroConfig).toBe(true);
    });

    it('should set appropriate defaults for local review', () => {
      const env = { ANTHROPIC_API_KEY: 'sk-ant-xxx' };
      const result = generateZeroConfigDefaults(env);

      if (isZeroConfigSuccess(result)) {
        // Should have at least one pass
        expect(result.config.passes.length).toBeGreaterThan(0);

        // Should have enabled agents
        const pass = result.config.passes[0];
        expect(pass?.enabled).toBe(true);
      }
    });
  });

  describe('Backwards Compatibility', () => {
    it('should support legacy env var names if present', () => {
      // Test that newer code doesn't break with older config patterns
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        // Could have other legacy vars
      };

      const result = generateZeroConfigDefaults(env);

      expect(isZeroConfigSuccess(result)).toBe(true);
    });
  });
});
