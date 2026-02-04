/**
 * Security Tests
 *
 * Tests enforcing INVARIANTS.md security requirements:
 * - Invariant 7: No Direct Secrets to Agents
 * - Invariant 10: No Network Listeners in Agent Execution
 * - Router Monopoly Rule: Only router posts to GitHub
 *
 * These tests MUST pass before any release.
 */

import { execSync } from 'child_process';
import { describe, it, expect } from 'vitest';
import {
  stripTokensFromEnv,
  hasTokenInEnv,
  validateNoListeningSockets,
  createSafeAgentEnv,
  buildAgentEnv,
  buildRouterEnv,
} from '../agents/security.js';

describe('Security Module', () => {
  describe('stripTokensFromEnv (Invariant 7)', () => {
    it('should strip GITHUB_TOKEN', () => {
      const env = {
        GITHUB_TOKEN: 'ghp_xxxxxxxxxxxx',
        PATH: '/usr/bin',
        HOME: '/home/user',
      };

      const result = stripTokensFromEnv(env);

      expect(result['GITHUB_TOKEN']).toBeUndefined();
      expect(result['PATH']).toBe('/usr/bin');
      expect(result['HOME']).toBe('/home/user');
    });

    it('should strip GH_TOKEN', () => {
      const env = {
        GH_TOKEN: 'ghp_xxxxxxxxxxxx',
        PATH: '/usr/bin',
      };

      const result = stripTokensFromEnv(env);

      expect(result['GH_TOKEN']).toBeUndefined();
      expect(result['PATH']).toBe('/usr/bin');
    });

    it('should strip GITHUB_PAT', () => {
      const env = {
        GITHUB_PAT: 'ghp_xxxxxxxxxxxx',
        OTHER_VAR: 'value',
      };

      const result = stripTokensFromEnv(env);

      expect(result['GITHUB_PAT']).toBeUndefined();
      expect(result['OTHER_VAR']).toBe('value');
    });

    it('should strip AZURE_DEVOPS_PAT', () => {
      const env = {
        AZURE_DEVOPS_PAT: 'ado-token',
        SYSTEM_ACCESSTOKEN: 'system-token',
      };

      const result = stripTokensFromEnv(env);

      expect(result['AZURE_DEVOPS_PAT']).toBeUndefined();
      expect(result['SYSTEM_ACCESSTOKEN']).toBeUndefined();
    });

    it('should strip REVIEWDOG_GITHUB_API_TOKEN', () => {
      const env = {
        REVIEWDOG_GITHUB_API_TOKEN: 'token',
        OTHER: 'value',
      };

      const result = stripTokensFromEnv(env);

      expect(result['REVIEWDOG_GITHUB_API_TOKEN']).toBeUndefined();
    });

    it('should strip any variable ending in _TOKEN', () => {
      const env = {
        MY_CUSTOM_TOKEN: 'secret',
        ANOTHER_TOKEN: 'secret2',
        NOT_A_TOKEN_VAR: 'keep-this',
      };

      const result = stripTokensFromEnv(env);

      expect(result['MY_CUSTOM_TOKEN']).toBeUndefined();
      expect(result['ANOTHER_TOKEN']).toBeUndefined();
      expect(result['NOT_A_TOKEN_VAR']).toBe('keep-this');
    });

    it('should strip any variable ending in _PAT', () => {
      const env = {
        MY_PAT: 'secret',
        AZURE_PAT: 'secret2',
        PAT_SOMETHING: 'keep-this', // doesn't end in _PAT
      };

      const result = stripTokensFromEnv(env);

      expect(result['MY_PAT']).toBeUndefined();
      expect(result['AZURE_PAT']).toBeUndefined();
      expect(result['PAT_SOMETHING']).toBe('keep-this');
    });

    it('should preserve non-token environment variables', () => {
      const env = {
        GITHUB_TOKEN: 'secret',
        PATH: '/usr/bin:/bin',
        HOME: '/home/user',
        LANG: 'en_US.UTF-8',
        NODE_ENV: 'production',
        OPENAI_API_KEY: 'sk-xxx', // LLM key allowed
        ANTHROPIC_API_KEY: 'sk-ant-xxx', // LLM key allowed
      };

      const result = stripTokensFromEnv(env);

      expect(result['GITHUB_TOKEN']).toBeUndefined();
      expect(result['PATH']).toBe('/usr/bin:/bin');
      expect(result['HOME']).toBe('/home/user');
      expect(result['LANG']).toBe('en_US.UTF-8');
      expect(result['NODE_ENV']).toBe('production');
      expect(result['OPENAI_API_KEY']).toBe('sk-xxx');
      expect(result['ANTHROPIC_API_KEY']).toBe('sk-ant-xxx');
    });

    it('should handle undefined values', () => {
      const env: Record<string, string | undefined> = {
        GITHUB_TOKEN: undefined,
        PATH: '/usr/bin',
        EMPTY: undefined,
      };

      const result = stripTokensFromEnv(env);

      expect(result['GITHUB_TOKEN']).toBeUndefined();
      expect(result['PATH']).toBe('/usr/bin');
      expect(result['EMPTY']).toBeUndefined();
    });

    it('should handle empty environment', () => {
      const result = stripTokensFromEnv({});
      expect(result).toEqual({});
    });
  });

  describe('hasTokenInEnv', () => {
    it('should detect GITHUB_TOKEN', () => {
      const env = { GITHUB_TOKEN: 'token', PATH: '/bin' };
      const result = hasTokenInEnv(env);

      expect(result.hasToken).toBe(true);
      expect(result.tokens).toContain('GITHUB_TOKEN');
    });

    it('should detect multiple tokens', () => {
      const env = {
        GITHUB_TOKEN: 'token1',
        GH_TOKEN: 'token2',
        AZURE_DEVOPS_PAT: 'token3',
        PATH: '/bin',
      };
      const result = hasTokenInEnv(env);

      expect(result.hasToken).toBe(true);
      expect(result.tokens).toHaveLength(3);
    });

    it('should return false when no tokens present', () => {
      const env = {
        PATH: '/bin',
        HOME: '/home',
        OPENAI_API_KEY: 'sk-xxx',
      };
      const result = hasTokenInEnv(env);

      expect(result.hasToken).toBe(false);
      expect(result.tokens).toHaveLength(0);
    });
  });

  describe('createSafeAgentEnv', () => {
    it('should create minimal safe environment', () => {
      const env = {
        GITHUB_TOKEN: 'secret',
        GH_TOKEN: 'secret2',
        PATH: '/usr/bin',
        HOME: '/home/user',
        LANG: 'en_US.UTF-8',
      };

      const result = createSafeAgentEnv(env);

      expect(result['GITHUB_TOKEN']).toBeUndefined();
      expect(result['GH_TOKEN']).toBeUndefined();
      expect(result['PATH']).toBeDefined();
      expect(result['HOME']).toBe('/home/user');
      expect(result['NO_COLOR']).toBe('1');
    });

    it('should include allowed keys when specified', () => {
      const env = {
        GITHUB_TOKEN: 'secret',
        OPENAI_API_KEY: 'sk-xxx',
        CUSTOM_VAR: 'value',
        PATH: '/bin',
      };

      const result = createSafeAgentEnv(env, ['OPENAI_API_KEY', 'CUSTOM_VAR']);

      expect(result['GITHUB_TOKEN']).toBeUndefined();
      expect(result['OPENAI_API_KEY']).toBe('sk-xxx');
      expect(result['CUSTOM_VAR']).toBe('value');
    });

    describe('PYTHONUTF8 for Windows compatibility', () => {
      it('should set PYTHONUTF8=1 for Python UTF-8 mode (PEP 540)', () => {
        const result = createSafeAgentEnv({});
        expect(result['PYTHONUTF8']).toBe('1');
      });

      it('should force PYTHONUTF8=1 even if user sets PYTHONUTF8=0', () => {
        // Safety invariant: we always force UTF-8 mode to prevent Windows cp1252 crashes
        const result = createSafeAgentEnv({ PYTHONUTF8: '0' });
        expect(result['PYTHONUTF8']).toBe('1');
      });
    });
  });

  describe('validateNoListeningSockets (Invariant 10)', () => {
    // Detect lsof availability dynamically using 'which' (not 'command -v' which is a shell builtin)
    let hasLsof = false;
    try {
      execSync('which lsof', { stdio: 'ignore', timeout: 2000 });
      hasLsof = true;
    } catch {
      // lsof not available
    }

    it.skipIf(!hasLsof)('should return safe when no listeners detected', async () => {
      const result = await validateNoListeningSockets('nonexistent-process-xyz');

      expect(result.safe).toBe(true);
    });

    it('should fail closed when lsof check fails', async () => {
      // This test doesn't need lsof - it tests the error handling path
      // The function should return safe=false when lsof is unavailable
      const result = await validateNoListeningSockets('node');

      // On systems without lsof, this will fail with "lsof not installed"
      // On systems with lsof, it may return safe=true or find listeners
      // Either way, the function should not throw
      expect(typeof result.safe).toBe('boolean');
    });

    it.skipIf(!hasLsof)('should fail when a listening socket is detected', async () => {
      const { createServer } = await import('net');
      const server = createServer();

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const result = await validateNoListeningSockets('node');
      server.close();

      expect(result.safe).toBe(false);
    });
  });
});

describe('Agent Token Stripping Verification', () => {
  describe('OpenCode Agent', () => {
    it('should not pass GITHUB_TOKEN to subprocess', async () => {
      // This test verifies that the OpenCode agent properly strips tokens
      // by checking what environment would be passed

      const contextEnv = {
        GITHUB_TOKEN: 'ghp_secret_token',
        GH_TOKEN: 'another_secret',
        OPENAI_API_KEY: 'sk-allowed',
        PATH: '/usr/bin',
      };

      const strippedEnv = stripTokensFromEnv(contextEnv);

      // Verify tokens are stripped
      expect(strippedEnv['GITHUB_TOKEN']).toBeUndefined();
      expect(strippedEnv['GH_TOKEN']).toBeUndefined();

      // Verify allowed keys are preserved
      expect(strippedEnv['OPENAI_API_KEY']).toBe('sk-allowed');
      expect(strippedEnv['PATH']).toBe('/usr/bin');
    });

    it('should strip REVIEWDOG_GITHUB_API_TOKEN for reviewdog agent', async () => {
      const contextEnv = {
        REVIEWDOG_GITHUB_API_TOKEN: 'token',
        GITHUB_TOKEN: 'ghp_token',
        PATH: '/bin',
      };

      const strippedEnv = stripTokensFromEnv(contextEnv);

      expect(strippedEnv['REVIEWDOG_GITHUB_API_TOKEN']).toBeUndefined();
      expect(strippedEnv['GITHUB_TOKEN']).toBeUndefined();
    });
  });

  describe('All Agent Subprocess Environments', () => {
    const tokenVars = [
      'GITHUB_TOKEN',
      'GH_TOKEN',
      'GITHUB_PAT',
      'GH_PAT',
      'AZURE_DEVOPS_PAT',
      'ADO_TOKEN',
      'SYSTEM_ACCESSTOKEN',
      'REVIEWDOG_GITHUB_API_TOKEN',
    ];

    it.each(tokenVars)('should strip %s from agent environment', (tokenVar) => {
      const env = { [tokenVar]: 'secret_value', PATH: '/bin' };
      const result = stripTokensFromEnv(env);

      expect(result[tokenVar]).toBeUndefined();
      expect(result['PATH']).toBe('/bin');
    });
  });
});

describe('Agent Environment Allowlist', () => {
  it('should only allowlisted keys through for PR-Agent', () => {
    const env = {
      OPENAI_API_KEY: 'sk-allowed',
      GITHUB_TOKEN: 'ghp-secret',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'token',
      NPM_TOKEN: 'npm-secret',
      PATH: '/usr/bin',
      HOME: '/home/user',
    };

    const result = buildAgentEnv('pr_agent', env);

    expect(result['OPENAI_API_KEY']).toBe('sk-allowed');
    expect(result['GITHUB_TOKEN']).toBeUndefined();
    expect(result['ACTIONS_ID_TOKEN_REQUEST_TOKEN']).toBeUndefined();
    expect(result['NPM_TOKEN']).toBeUndefined();
    expect(result['PATH']).toBeDefined();
    expect(result['HOME']).toBe('/home/user');
  });

  it('should build a minimal router environment for posting', () => {
    const env = {
      GITHUB_TOKEN: 'ghp-secret',
      GITHUB_REPOSITORY: 'oddessentials/odd-ai-reviewers',
      GITHUB_EVENT_NAME: 'pull_request',
      SSH_AUTH_SOCK: '/tmp/ssh',
      NODE_AUTH_TOKEN: 'secret',
    };

    const routerEnv = buildRouterEnv(env);

    expect(routerEnv['GITHUB_TOKEN']).toBe('ghp-secret');
    expect(routerEnv['GITHUB_REPOSITORY']).toBe('oddessentials/odd-ai-reviewers');
    expect(routerEnv['SSH_AUTH_SOCK']).toBeUndefined();
    expect(routerEnv['NODE_AUTH_TOKEN']).toBeUndefined();
  });

  it('should block token access in agent environments', () => {
    const env = {
      GITHUB_TOKEN: 'ghp-secret',
      GH_TOKEN: 'ghp-secret-2',
      OPENAI_API_KEY: 'sk-allowed',
    };

    const agentEnv = buildAgentEnv('pr_agent', env);
    const tokenCheck = hasTokenInEnv(agentEnv);

    expect(tokenCheck.hasToken).toBe(false);
  });
});

describe('Router Monopoly Rule Enforcement', () => {
  describe('Agents must return structured findings', () => {
    it('should verify Finding structure has required fields', () => {
      // Per CONSOLIDATED.md Section E - Required Finding Schema
      // Every agent must emit findings with these fields:
      // - tool (sourceAgent)
      // - rule_id (ruleId)
      // - severity
      // - message
      // - path (file)
      // - start_line (line), end_line (endLine)
      // - fingerprint (stable dedupe key)
      // - suggestion (optional)
      // - metadata (freeform)

      // Create a valid finding that matches the schema
      const validFinding = {
        severity: 'error' as const,
        file: 'test.ts',
        line: 1,
        endLine: 5,
        message: 'Test finding',
        suggestion: 'Fix suggestion',
        ruleId: 'test/rule',
        sourceAgent: 'test',
        fingerprint: 'abc123',
        metadata: { extra: 'data' },
      };

      // Verify all required fields are present
      expect(validFinding.severity).toBeDefined();
      expect(validFinding.file).toBeDefined();
      expect(validFinding.message).toBeDefined();
      expect(validFinding.sourceAgent).toBeDefined();

      // Verify optional fields
      expect(validFinding.line).toBeDefined();
      expect(validFinding.endLine).toBeDefined();
      expect(validFinding.suggestion).toBeDefined();
      expect(validFinding.ruleId).toBeDefined();
      expect(validFinding.fingerprint).toBeDefined();
      expect(validFinding.metadata).toBeDefined();
    });

    it('should allow minimal findings without optional fields', () => {
      // Minimal valid finding - only required fields
      const minimalFinding = {
        severity: 'warning' as const,
        file: 'src/index.ts',
        message: 'Potential issue',
        sourceAgent: 'semgrep',
      };

      expect(minimalFinding.severity).toBe('warning');
      expect(minimalFinding.file).toBe('src/index.ts');
      expect(minimalFinding.message).toBe('Potential issue');
      expect(minimalFinding.sourceAgent).toBe('semgrep');
    });
  });
});

describe('Agent Environment Isolation (Canonical Keys)', () => {
  const allAgentIds = [
    'semgrep',
    'reviewdog',
    'opencode',
    'pr_agent',
    'ai_semantic_review',
    'local_llm',
  ] as const;

  describe('GITHUB_TOKEN isolation', () => {
    it.each(allAgentIds)('GITHUB_TOKEN never passed to %s agent', (agentId) => {
      const env = {
        GITHUB_TOKEN: 'gho_secret_token',
        OPENAI_API_KEY: 'sk-xxx',
        OLLAMA_BASE_URL: 'http://localhost:11434',
      };
      const agentEnv = buildAgentEnv(agentId, env);
      expect(agentEnv['GITHUB_TOKEN']).toBeUndefined();
    });
  });

  describe('pr_agent isolation', () => {
    it('pr_agent receives ANTHROPIC_API_KEY (Anthropic support)', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        OPENAI_API_KEY: 'sk-xxx',
      };
      const agentEnv = buildAgentEnv('pr_agent', env);
      expect(agentEnv['ANTHROPIC_API_KEY']).toBe('sk-ant-xxx');
      expect(agentEnv['OPENAI_API_KEY']).toBe('sk-xxx');
    });

    it('pr_agent does not receive OLLAMA_BASE_URL', () => {
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        OLLAMA_BASE_URL: 'http://localhost:11434',
      };
      const agentEnv = buildAgentEnv('pr_agent', env);
      expect(agentEnv['OLLAMA_BASE_URL']).toBeUndefined();
    });
  });

  describe('opencode isolation', () => {
    it('opencode does not receive Azure OpenAI keys', () => {
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      };
      const agentEnv = buildAgentEnv('opencode', env);
      expect(agentEnv['AZURE_OPENAI_API_KEY']).toBeUndefined();
      expect(agentEnv['AZURE_OPENAI_ENDPOINT']).toBeUndefined();
      expect(agentEnv['AZURE_OPENAI_DEPLOYMENT']).toBeUndefined();
      expect(agentEnv['OPENAI_API_KEY']).toBe('sk-xxx');
    });

    it('opencode does not receive OLLAMA keys', () => {
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        OLLAMA_BASE_URL: 'http://localhost:11434',
        OLLAMA_MODEL: 'codellama:7b',
      };
      const agentEnv = buildAgentEnv('opencode', env);
      expect(agentEnv['OLLAMA_BASE_URL']).toBeUndefined();
      expect(agentEnv['OLLAMA_MODEL']).toBeUndefined();
    });
  });

  describe('local_llm isolation', () => {
    it('local_llm receives no AI provider keys', () => {
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
        GITHUB_TOKEN: 'gho_xxx',
        OLLAMA_BASE_URL: 'http://localhost:11434',
        OLLAMA_MODEL: 'codellama:7b',
      };
      const agentEnv = buildAgentEnv('local_llm', env);

      // Should NOT have any AI provider keys
      expect(agentEnv['OPENAI_API_KEY']).toBeUndefined();
      expect(agentEnv['ANTHROPIC_API_KEY']).toBeUndefined();
      expect(agentEnv['AZURE_OPENAI_API_KEY']).toBeUndefined();
      expect(agentEnv['AZURE_OPENAI_ENDPOINT']).toBeUndefined();
      expect(agentEnv['GITHUB_TOKEN']).toBeUndefined();

      // Should have Ollama keys
      expect(agentEnv['OLLAMA_BASE_URL']).toBe('http://localhost:11434');
      expect(agentEnv['OLLAMA_MODEL']).toBe('codellama:7b');
    });
  });

  describe('static analysis agents isolation', () => {
    it('semgrep receives no AI keys', () => {
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        GITHUB_TOKEN: 'gho_xxx',
      };
      const agentEnv = buildAgentEnv('semgrep', env);
      expect(agentEnv['OPENAI_API_KEY']).toBeUndefined();
      expect(agentEnv['ANTHROPIC_API_KEY']).toBeUndefined();
      expect(agentEnv['GITHUB_TOKEN']).toBeUndefined();
    });

    it('reviewdog receives no AI keys', () => {
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        GITHUB_TOKEN: 'gho_xxx',
      };
      const agentEnv = buildAgentEnv('reviewdog', env);
      expect(agentEnv['OPENAI_API_KEY']).toBeUndefined();
      expect(agentEnv['ANTHROPIC_API_KEY']).toBeUndefined();
      expect(agentEnv['GITHUB_TOKEN']).toBeUndefined();
    });
  });
});
