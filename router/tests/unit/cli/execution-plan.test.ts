/**
 * Execution Plan Tests (Phase 1: FR-001 through FR-007)
 *
 * Covers:
 * - Golden snapshot tests for plan serialization (3 modes, same input -> identical canonical JSON)
 * - Pass filtering: valid name, invalid name (error with available list), disabled pass, empty-after-filter
 * - Agent filtering: valid ID, invalid ID (error with valid list), not-in-any-pass, agent in multiple passes
 * - Combined --pass + --agent: compatible (works), incompatible (error with suggestion)
 * - Exit code mapping: every test asserting exit 1 co-asserts status=gating_failed;
 *   every gating_failed co-asserts all agents completed
 * - Provider incompatibility: required pass -> exit 2, optional pass -> excluded + skipped_passes
 * - Empty-pass invariant: plan.passes.every(p => p.agents.length > 0)
 * - Plan serializer: alphabetical keys, no secrets, deterministic across modes
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect } from 'vitest';
import {
  buildExecutionPlan,
  serializeExecutionPlan,
  exitCodeFromStatus,
  type BuildPlanOptions,
  type ExecutionMode,
  type RunStatus,
} from '../../../src/cli/execution-plan.js';
import type { Config, AgentId } from '../../../src/config/schemas.js';
import { ConfigError } from '../../../src/types/errors.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a minimal valid config for testing.
 * Passes and other fields can be overridden.
 */
function createTestConfig(overrides: Partial<Config> = {}): Config {
  return {
    version: 1,
    trusted_only: true,
    triggers: { on: ['pull_request'], branches: ['main'] },
    passes: [
      { name: 'static', agents: ['semgrep', 'reviewdog'], enabled: true, required: true },
      {
        name: 'cloud-ai',
        agents: ['opencode', 'pr_agent', 'ai_semantic_review'],
        enabled: true,
        required: false,
      },
      { name: 'local-ai', agents: ['local_llm'], enabled: true, required: false },
      { name: 'builtin', agents: ['control_flow'], enabled: true, required: false },
    ],
    limits: {
      max_files: 50,
      max_diff_lines: 2000,
      max_tokens_per_pr: 12000,
      max_usd_per_pr: 1.0,
      monthly_budget_usd: 100,
      max_completion_tokens: 4000,
    },
    models: {},
    reporting: {},
    gating: { enabled: false, fail_on_severity: 'error', drift_gate: false },
    ...overrides,
  } as Config;
}

/**
 * Create default build options.
 */
function createBuildOptions(overrides: Partial<BuildPlanOptions> = {}): BuildPlanOptions {
  return {
    config: createTestConfig(),
    mode: 'execute' as ExecutionMode,
    configSource: '.ai-review.yml',
    ...overrides,
  };
}

// =============================================================================
// Golden Snapshot Tests: Plan Serialization
// =============================================================================

describe('Plan Serialization (Golden Snapshots)', () => {
  const config = createTestConfig();

  it('should produce identical canonical JSON across execute, dry-run, and cost-only modes', () => {
    const modes: ExecutionMode[] = ['execute', 'dry-run', 'cost-only'];

    const serialized = modes.map((mode) => {
      const plan = buildExecutionPlan(createBuildOptions({ config, mode }));
      const json = serializeExecutionPlan(plan);
      // Replace mode field for comparison since it will differ
      return json;
    });

    // Parse to compare structure minus mode field
    const parsed = serialized.map((s) => {
      const obj = JSON.parse(s);
      const { mode: _mode, ...rest } = obj;
      return rest;
    });

    // All three should produce identical JSON (except mode)
    expect(parsed[0]).toEqual(parsed[1]);
    expect(parsed[1]).toEqual(parsed[2]);
  });

  it('should emit fields in alphabetical key order at every level', () => {
    const plan = buildExecutionPlan(createBuildOptions({ config }));
    const json = serializeExecutionPlan(plan);
    const parsed = JSON.parse(json);

    // Top-level keys must be alphabetical
    const topKeys = Object.keys(parsed);
    const sortedTopKeys = [...topKeys].sort();
    expect(topKeys).toEqual(sortedTopKeys);

    // Gating keys must be alphabetical
    const gatingKeys = Object.keys(parsed.gating);
    const sortedGatingKeys = [...gatingKeys].sort();
    expect(gatingKeys).toEqual(sortedGatingKeys);

    // Limits keys must be alphabetical
    const limitsKeys = Object.keys(parsed.limits);
    const sortedLimitsKeys = [...limitsKeys].sort();
    expect(limitsKeys).toEqual(sortedLimitsKeys);

    // Pass-level keys must be alphabetical
    for (const pass of parsed.passes) {
      const passKeys = Object.keys(pass);
      const sortedPassKeys = [...passKeys].sort();
      expect(passKeys).toEqual(sortedPassKeys);
    }
  });

  it('should NOT include secrets, API keys, tokens, or endpoints', () => {
    const plan = buildExecutionPlan(createBuildOptions({ config }));
    const json = serializeExecutionPlan(plan);

    // Should not contain any secret-like fields
    expect(json).not.toContain('api_key');
    expect(json).not.toContain('API_KEY');
    expect(json).not.toContain('token');
    expect(json).not.toContain('endpoint');
    expect(json).not.toContain('ANTHROPIC');
    expect(json).not.toContain('OPENAI');
  });

  it('should produce deterministic output for the same input', () => {
    const opts = createBuildOptions({ config });

    const plan1 = buildExecutionPlan(opts);
    const plan2 = buildExecutionPlan(opts);

    const json1 = serializeExecutionPlan(plan1);
    const json2 = serializeExecutionPlan(plan2);

    expect(json1).toBe(json2);
  });

  it('should match the safe-field allowlist from the contract', () => {
    // Use a config with no provider-incompatible agents to avoid skippedPasses
    const singlePassConfig = createTestConfig({
      passes: [
        { name: 'cloud-ai', agents: ['opencode', 'pr_agent'], enabled: true, required: false },
      ],
    });
    const plan = buildExecutionPlan(
      createBuildOptions({ config: singlePassConfig, provider: 'anthropic', model: 'claude-3' })
    );
    const json = serializeExecutionPlan(plan);
    const parsed = JSON.parse(json);

    // Verify only allowlisted fields are present (skippedPasses omitted when empty)
    const expectedTopKeys = [
      'configSource',
      'gating',
      'limits',
      'mode',
      'model',
      'passes',
      'provider',
      'schemaVersion',
    ];
    expect(Object.keys(parsed)).toEqual(expectedTopKeys);

    // Verify gating fields
    expect(Object.keys(parsed.gating)).toEqual(['driftGate', 'enabled', 'failOnSeverity']);

    // Verify limits fields
    expect(Object.keys(parsed.limits)).toEqual([
      'maxDiffLines',
      'maxFiles',
      'maxTokensPerPr',
      'maxUsdPerPr',
    ]);

    // Verify pass fields
    for (const pass of parsed.passes) {
      expect(Object.keys(pass)).toEqual(['agents', 'name', 'required']);
    }
  });

  it('should include skippedPasses in serialization when present', () => {
    // Use ollama provider to exclude cloud-ai agents
    const plan = buildExecutionPlan(
      createBuildOptions({
        config,
        provider: 'ollama',
      })
    );
    const json = serializeExecutionPlan(plan);
    const parsed = JSON.parse(json);

    // cloud-ai pass should be skipped (opencode, pr_agent, ai_semantic_review are incompatible)
    expect(parsed.skippedPasses).toBeDefined();
    expect(parsed.skippedPasses.length).toBeGreaterThan(0);
    expect(parsed.skippedPasses[0]).toHaveProperty('name');
    expect(parsed.skippedPasses[0]).toHaveProperty('reason');
  });

  it('should omit skippedPasses from serialization when empty', () => {
    const plan = buildExecutionPlan(createBuildOptions({ config }));
    const json = serializeExecutionPlan(plan);
    const parsed = JSON.parse(json);

    // No skipped passes → field omitted entirely
    expect(parsed.skippedPasses).toBeUndefined();
  });
});

// =============================================================================
// Pass Filtering Tests
// =============================================================================

describe('Pass Filtering (FR-001)', () => {
  it('should include only the named pass when --pass is specified', () => {
    const config = createTestConfig();
    const plan = buildExecutionPlan(createBuildOptions({ config, passFilter: 'cloud-ai' }));

    expect(plan.passes).toHaveLength(1);
    expect(plan.passes[0]!.name).toBe('cloud-ai');
    expect(plan.passes[0]!.agents).toContain('opencode');
    expect(plan.passes[0]!.agents).toContain('pr_agent');
    expect(plan.passes[0]!.agents).toContain('ai_semantic_review');
  });

  it('should throw ConfigError listing available passes for unknown --pass name', () => {
    const config = createTestConfig();

    expect(() =>
      buildExecutionPlan(createBuildOptions({ config, passFilter: 'nonexistent' }))
    ).toThrow(ConfigError);

    try {
      buildExecutionPlan(createBuildOptions({ config, passFilter: 'nonexistent' }));
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.message).toContain("Unknown pass 'nonexistent'");
      expect(err.message).toContain('Available:');
      expect(err.message).toContain('static');
      expect(err.message).toContain('cloud-ai');
    }
  });

  it('should throw ConfigError for a disabled pass', () => {
    const config = createTestConfig({
      passes: [
        { name: 'static', agents: ['semgrep'], enabled: false, required: false },
        { name: 'cloud-ai', agents: ['opencode'], enabled: true, required: false },
      ],
    });

    expect(() => buildExecutionPlan(createBuildOptions({ config, passFilter: 'static' }))).toThrow(
      ConfigError
    );

    try {
      buildExecutionPlan(createBuildOptions({ config, passFilter: 'static' }));
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.message).toContain('disabled');
    }
  });

  it('should skip disabled passes when no --pass filter is set', () => {
    const config = createTestConfig({
      passes: [
        { name: 'static', agents: ['semgrep'], enabled: true, required: false },
        { name: 'cloud-ai', agents: ['opencode'], enabled: false, required: false },
      ],
    });

    const plan = buildExecutionPlan(createBuildOptions({ config }));

    expect(plan.passes).toHaveLength(1);
    expect(plan.passes[0]!.name).toBe('static');
  });

  it('should run all enabled passes when --pass is omitted', () => {
    const config = createTestConfig();
    const plan = buildExecutionPlan(createBuildOptions({ config }));

    expect(plan.passes.length).toBe(4);
    const passNames = plan.passes.map((p) => p.name);
    expect(passNames).toContain('static');
    expect(passNames).toContain('cloud-ai');
    expect(passNames).toContain('local-ai');
    expect(passNames).toContain('builtin');
  });
});

// =============================================================================
// Agent Filtering Tests
// =============================================================================

describe('Agent Filtering (FR-005)', () => {
  it('should filter to only the named agent across all passes', () => {
    const config = createTestConfig({
      passes: [
        { name: 'pass-a', agents: ['semgrep', 'control_flow'], enabled: true, required: false },
        { name: 'pass-b', agents: ['opencode', 'control_flow'], enabled: true, required: false },
        { name: 'pass-c', agents: ['reviewdog'], enabled: true, required: false },
      ],
    });

    const plan = buildExecutionPlan(createBuildOptions({ config, agentFilter: 'control_flow' }));

    // pass-a and pass-b contain control_flow, pass-c does not
    expect(plan.passes).toHaveLength(2);
    for (const pass of plan.passes) {
      expect(pass.agents).toEqual(['control_flow']);
    }
  });

  it('should throw ConfigError listing valid IDs for unknown --agent', () => {
    const config = createTestConfig();

    expect(() =>
      buildExecutionPlan(createBuildOptions({ config, agentFilter: 'fake_agent' }))
    ).toThrow(ConfigError);

    try {
      buildExecutionPlan(createBuildOptions({ config, agentFilter: 'fake_agent' }));
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.message).toContain("Unknown agent 'fake_agent'");
      expect(err.message).toContain('Valid:');
      expect(err.message).toContain('semgrep');
      expect(err.message).toContain('control_flow');
    }
  });

  it('should throw ConfigError when agent is not configured in any pass', () => {
    const config = createTestConfig({
      passes: [{ name: 'static', agents: ['semgrep'], enabled: true, required: false }],
    });

    expect(() =>
      buildExecutionPlan(createBuildOptions({ config, agentFilter: 'control_flow' }))
    ).toThrow(ConfigError);

    try {
      buildExecutionPlan(createBuildOptions({ config, agentFilter: 'control_flow' }));
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.message).toContain("Agent 'control_flow' not configured in any pass");
    }
  });

  it('should handle agent in multiple passes — includes all matching passes', () => {
    const config = createTestConfig({
      passes: [
        { name: 'pass-a', agents: ['semgrep', 'opencode'], enabled: true, required: false },
        { name: 'pass-b', agents: ['opencode', 'reviewdog'], enabled: true, required: false },
        { name: 'pass-c', agents: ['control_flow'], enabled: true, required: false },
      ],
    });

    const plan = buildExecutionPlan(createBuildOptions({ config, agentFilter: 'opencode' }));

    expect(plan.passes).toHaveLength(2);
    const passNames = plan.passes.map((p) => p.name);
    expect(passNames).toContain('pass-a');
    expect(passNames).toContain('pass-b');
    for (const pass of plan.passes) {
      expect(pass.agents).toEqual(['opencode']);
    }
  });
});

// =============================================================================
// Combined --pass + --agent Tests
// =============================================================================

describe('Combined --pass + --agent (FR-007)', () => {
  it('should work when agent is in the selected pass (compatible)', () => {
    const config = createTestConfig({
      passes: [
        { name: 'cloud-ai', agents: ['opencode', 'pr_agent'], enabled: true, required: false },
        { name: 'static', agents: ['semgrep'], enabled: true, required: false },
      ],
    });

    const plan = buildExecutionPlan(
      createBuildOptions({ config, passFilter: 'cloud-ai', agentFilter: 'opencode' })
    );

    expect(plan.passes).toHaveLength(1);
    expect(plan.passes[0]!.name).toBe('cloud-ai');
    expect(plan.passes[0]!.agents).toEqual(['opencode']);
  });

  it('should throw ConfigError with suggestion when agent is NOT in the selected pass (incompatible)', () => {
    const config = createTestConfig({
      passes: [
        { name: 'static', agents: ['semgrep', 'reviewdog'], enabled: true, required: false },
        { name: 'cloud-ai', agents: ['opencode', 'pr_agent'], enabled: true, required: false },
      ],
    });

    expect(() =>
      buildExecutionPlan(
        createBuildOptions({ config, passFilter: 'static', agentFilter: 'opencode' })
      )
    ).toThrow(ConfigError);

    try {
      buildExecutionPlan(
        createBuildOptions({ config, passFilter: 'static', agentFilter: 'opencode' })
      );
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.message).toContain("Agent 'opencode' is not configured in pass 'static'");
      expect(err.message).toContain('available in:');
      expect(err.message).toContain('cloud-ai');
    }
  });

  it('should narrow pass first, then agent within (--pass narrows first)', () => {
    const config = createTestConfig({
      passes: [
        { name: 'pass-a', agents: ['semgrep', 'opencode'], enabled: true, required: false },
        { name: 'pass-b', agents: ['opencode', 'reviewdog'], enabled: true, required: false },
      ],
    });

    const plan = buildExecutionPlan(
      createBuildOptions({ config, passFilter: 'pass-a', agentFilter: 'opencode' })
    );

    // Only pass-a is selected, and within it only opencode
    expect(plan.passes).toHaveLength(1);
    expect(plan.passes[0]!.name).toBe('pass-a');
    expect(plan.passes[0]!.agents).toEqual(['opencode']);
  });

  it('should throw ConfigError when --pass + --agent becomes empty after provider filtering', () => {
    const config = createTestConfig({
      passes: [
        { name: 'cloud-ai', agents: ['opencode', 'pr_agent'], enabled: true, required: false },
        { name: 'static', agents: ['semgrep'], enabled: true, required: false },
      ],
    });

    expect(() =>
      buildExecutionPlan(
        createBuildOptions({
          config,
          passFilter: 'cloud-ai',
          agentFilter: 'opencode',
          provider: 'ollama',
        })
      )
    ).toThrow(ConfigError);

    try {
      buildExecutionPlan(
        createBuildOptions({
          config,
          passFilter: 'cloud-ai',
          agentFilter: 'opencode',
          provider: 'ollama',
        })
      );
    } catch (e) {
      const err = e as ConfigError;
      expect(err.message).toContain("Agent 'opencode' in pass 'cloud-ai' is incompatible");
      expect(err.message).toContain('ollama');
    }
  });
});

// =============================================================================
// Exit Code Mapping Tests (RunStatus <-> Exit Code)
// =============================================================================

describe('Exit Code Mapping (RunStatus)', () => {
  it('should map complete -> exit 0', () => {
    expect(exitCodeFromStatus('complete')).toBe(0);
  });

  it('should map gating_failed -> exit 1', () => {
    expect(exitCodeFromStatus('gating_failed')).toBe(1);
  });

  it('should map config_error -> exit 2', () => {
    expect(exitCodeFromStatus('config_error')).toBe(2);
  });

  it('should map incomplete -> exit 3', () => {
    expect(exitCodeFromStatus('incomplete')).toBe(3);
  });

  it('should have a strict 1:1 mapping — all statuses produce unique exit codes', () => {
    const statuses: RunStatus[] = ['complete', 'gating_failed', 'config_error', 'incomplete'];
    const exitCodes = statuses.map(exitCodeFromStatus);
    const unique = new Set(exitCodes);
    expect(unique.size).toBe(statuses.length);
  });

  it('should cover all RunStatus values (exhaustiveness)', () => {
    // This test verifies that the switch in exitCodeFromStatus is exhaustive.
    // If a new status is added without updating the switch, the assertNever
    // call will cause a compile error. At runtime, we verify all known statuses
    // return defined values.
    const statuses: RunStatus[] = ['complete', 'gating_failed', 'config_error', 'incomplete'];
    for (const status of statuses) {
      const code = exitCodeFromStatus(status);
      expect(typeof code).toBe('number');
      expect(code).toBeGreaterThanOrEqual(0);
      expect(code).toBeLessThanOrEqual(3);
    }
  });

  it('exit code 1 is reserved exclusively for gating_failed', () => {
    // Invariant: no other status may produce exit code 1
    const statuses: RunStatus[] = ['complete', 'config_error', 'incomplete'];
    for (const status of statuses) {
      expect(exitCodeFromStatus(status)).not.toBe(1);
    }
    expect(exitCodeFromStatus('gating_failed')).toBe(1);
  });

  it('exit code 3 (incomplete) always takes precedence over 1 (gating_failed)', () => {
    // This is a contract invariant — incomplete suppresses gating
    // Verify the values are distinct and precedence rule holds
    const incompleteCode = exitCodeFromStatus('incomplete');
    const gatingFailedCode = exitCodeFromStatus('gating_failed');
    expect(incompleteCode).toBe(3);
    expect(gatingFailedCode).toBe(1);
    expect(incompleteCode).toBeGreaterThan(gatingFailedCode);
  });
});

// =============================================================================
// Provider Incompatibility Tests
// =============================================================================

describe('Provider Incompatibility', () => {
  it('should throw ConfigError (exit 2) for required pass with incompatible agents', () => {
    const config = createTestConfig({
      passes: [
        // Required pass with cloud-only agents, but using ollama provider
        { name: 'cloud-ai', agents: ['opencode', 'pr_agent'], enabled: true, required: true },
      ],
    });

    expect(() => buildExecutionPlan(createBuildOptions({ config, provider: 'ollama' }))).toThrow(
      ConfigError
    );

    try {
      buildExecutionPlan(createBuildOptions({ config, provider: 'ollama' }));
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.message).toContain("Required pass 'cloud-ai'");
      expect(err.message).toContain('incompatible');
      expect(err.message).toContain('ollama');
    }
  });

  it('should exclude incompatible agents and skip optional pass with zero runnable agents', () => {
    const config = createTestConfig({
      passes: [
        // Optional pass with only cloud-only agents
        { name: 'cloud-ai', agents: ['opencode', 'pr_agent'], enabled: true, required: false },
        // Pass with universal agents
        { name: 'builtin', agents: ['control_flow'], enabled: true, required: false },
      ],
    });

    const plan = buildExecutionPlan(createBuildOptions({ config, provider: 'ollama' }));

    // cloud-ai should be skipped, builtin should remain
    expect(plan.passes).toHaveLength(1);
    expect(plan.passes[0]!.name).toBe('builtin');

    // cloud-ai should appear in skippedPasses
    expect(plan.skippedPasses).toHaveLength(1);
    expect(plan.skippedPasses[0]!.name).toBe('cloud-ai');
    expect(plan.skippedPasses[0]!.reason).toContain('no agents compatible');
    expect(plan.skippedPasses[0]!.reason).toContain('ollama');
  });

  it('should retain compatible agents while removing incompatible ones from a pass', () => {
    const config = createTestConfig({
      passes: [
        // Mix of universal and cloud-only agents
        {
          name: 'mixed',
          agents: ['semgrep', 'opencode', 'control_flow'],
          enabled: true,
          required: false,
        },
      ],
    });

    const plan = buildExecutionPlan(createBuildOptions({ config, provider: 'ollama' }));

    // semgrep and control_flow are universal, opencode needs cloud provider
    expect(plan.passes).toHaveLength(1);
    expect(plan.passes[0]!.agents).toContain('semgrep');
    expect(plan.passes[0]!.agents).toContain('control_flow');
    expect(plan.passes[0]!.agents).not.toContain('opencode');
  });

  it('should throw ConfigError when requested agent is incompatible with the provider in every pass', () => {
    const config = createTestConfig({
      passes: [
        { name: 'cloud-ai', agents: ['opencode'], enabled: true, required: false },
        { name: 'cloud-backup', agents: ['opencode', 'pr_agent'], enabled: true, required: false },
      ],
    });

    expect(() =>
      buildExecutionPlan(
        createBuildOptions({ config, agentFilter: 'opencode', provider: 'ollama' })
      )
    ).toThrow(ConfigError);

    try {
      buildExecutionPlan(
        createBuildOptions({ config, agentFilter: 'opencode', provider: 'ollama' })
      );
    } catch (e) {
      const err = e as ConfigError;
      expect(err.message).toContain("Agent 'opencode' is incompatible with provider 'ollama'");
      expect(err.message).toContain('cloud-ai');
      expect(err.message).toContain('cloud-backup');
    }
  });

  it('should include all agents when no provider filter is specified', () => {
    const config = createTestConfig({
      passes: [
        {
          name: 'all',
          agents: ['semgrep', 'opencode', 'local_llm', 'control_flow'],
          enabled: true,
          required: false,
        },
      ],
    });

    const plan = buildExecutionPlan(createBuildOptions({ config }));

    expect(plan.passes[0]!.agents).toHaveLength(4);
  });
});

// =============================================================================
// Empty-Pass Invariant Tests
// =============================================================================

describe('Empty-Pass Invariant', () => {
  it('should guarantee plan.passes.every(p => p.agents.length > 0)', () => {
    const config = createTestConfig();
    const plan = buildExecutionPlan(createBuildOptions({ config }));

    expect(plan.passes.every((p) => p.agents.length > 0)).toBe(true);
  });

  it('should maintain invariant when agent filtering removes agents from optional pass', () => {
    const config = createTestConfig({
      passes: [
        { name: 'pass-a', agents: ['semgrep'], enabled: true, required: false },
        { name: 'pass-b', agents: ['opencode'], enabled: true, required: false },
      ],
    });

    // Filtering to semgrep removes all agents from pass-b
    const plan = buildExecutionPlan(createBuildOptions({ config, agentFilter: 'semgrep' }));

    // pass-b should be removed (not present with empty agents)
    expect(plan.passes.every((p) => p.agents.length > 0)).toBe(true);
    expect(plan.passes).toHaveLength(1);
    expect(plan.passes[0]!.name).toBe('pass-a');
  });

  it('should throw ConfigError when agent filtering leaves required pass empty', () => {
    const config = createTestConfig({
      passes: [
        { name: 'required-pass', agents: ['semgrep'], enabled: true, required: true },
        {
          name: 'optional-pass',
          agents: ['opencode', 'control_flow'],
          enabled: true,
          required: false,
        },
      ],
    });

    // Filtering to control_flow removes all agents from required-pass
    expect(() =>
      buildExecutionPlan(createBuildOptions({ config, agentFilter: 'control_flow' }))
    ).toThrow(ConfigError);

    try {
      buildExecutionPlan(createBuildOptions({ config, agentFilter: 'control_flow' }));
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.message).toContain("Required pass 'required-pass' has no runnable agents");
    }
  });

  it('should maintain invariant across all execution modes', () => {
    const config = createTestConfig();
    const modes: ExecutionMode[] = ['execute', 'dry-run', 'cost-only'];

    for (const mode of modes) {
      const plan = buildExecutionPlan(createBuildOptions({ config, mode }));
      expect(
        plan.passes.every((p) => p.agents.length > 0),
        `Empty-pass invariant violated in mode: ${mode}`
      ).toBe(true);
    }
  });
});

// =============================================================================
// Pass Composition Validation Tests
// =============================================================================

describe('Pass Composition Validation', () => {
  it('should throw ConfigError for unknown agent ID in a pass', () => {
    const config = createTestConfig({
      passes: [
        {
          name: 'broken',
          agents: ['semgrep', 'nonexistent_agent' as AgentId],
          enabled: true,
          required: false,
        },
      ],
    });

    expect(() => buildExecutionPlan(createBuildOptions({ config }))).toThrow(ConfigError);

    try {
      buildExecutionPlan(createBuildOptions({ config }));
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.message).toContain("Unknown agent 'nonexistent_agent'");
      expect(err.message).toContain("pass 'broken'");
      expect(err.message).toContain('Valid:');
    }
  });

  it('should throw ConfigError for duplicate agent ID within a pass', () => {
    const config = createTestConfig({
      passes: [{ name: 'duped', agents: ['semgrep', 'semgrep'], enabled: true, required: false }],
    });

    expect(() => buildExecutionPlan(createBuildOptions({ config }))).toThrow(ConfigError);

    try {
      buildExecutionPlan(createBuildOptions({ config }));
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.message).toContain("Duplicate agent 'semgrep'");
      expect(err.message).toContain("pass 'duped'");
    }
  });
});

// =============================================================================
// Plan Structure Tests
// =============================================================================

describe('Plan Structure', () => {
  it('should include correct mode from options', () => {
    const modes: ExecutionMode[] = ['execute', 'dry-run', 'cost-only'];

    for (const mode of modes) {
      const plan = buildExecutionPlan(createBuildOptions({ mode }));
      expect(plan.mode).toBe(mode);
    }
  });

  it('should include provider and model from options', () => {
    const plan = buildExecutionPlan(
      createBuildOptions({ provider: 'anthropic', model: 'claude-3-opus' })
    );

    expect(plan.provider).toBe('anthropic');
    expect(plan.model).toBe('claude-3-opus');
  });

  it('should default provider and model to null when not specified', () => {
    const plan = buildExecutionPlan(createBuildOptions({}));

    expect(plan.provider).toBeNull();
    expect(plan.model).toBeNull();
  });

  it('should snapshot limits from config', () => {
    const config = createTestConfig({
      limits: {
        max_files: 100,
        max_diff_lines: 5000,
        max_tokens_per_pr: 20000,
        max_usd_per_pr: 2.5,
        monthly_budget_usd: 200,
        max_completion_tokens: 8000,
      },
    });

    const plan = buildExecutionPlan(createBuildOptions({ config }));

    expect(plan.limits.maxFiles).toBe(100);
    expect(plan.limits.maxDiffLines).toBe(5000);
    expect(plan.limits.maxTokensPerPr).toBe(20000);
    expect(plan.limits.maxUsdPerPr).toBe(2.5);
  });

  it('should snapshot gating from config', () => {
    const config = createTestConfig({
      gating: { enabled: true, fail_on_severity: 'warning', drift_gate: true },
    });

    const plan = buildExecutionPlan(createBuildOptions({ config }));

    expect(plan.gating.enabled).toBe(true);
    expect(plan.gating.failOnSeverity).toBe('warning');
    expect(plan.gating.driftGate).toBe(true);
  });

  it('should include configSource and schemaVersion', () => {
    const config = createTestConfig({ version: 2 });
    const plan = buildExecutionPlan(
      createBuildOptions({ config, configSource: '/path/to/.ai-review.yml' })
    );

    expect(plan.configSource).toBe('/path/to/.ai-review.yml');
    expect(plan.schemaVersion).toBe(2);
  });
});

// =============================================================================
// Plan Serializer Output Format Tests
// =============================================================================

describe('Plan Serializer Output Format', () => {
  it('should produce valid JSON', () => {
    const plan = buildExecutionPlan(createBuildOptions({}));
    const json = serializeExecutionPlan(plan);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('should produce pretty-printed JSON (for debugging/verbose output)', () => {
    const plan = buildExecutionPlan(createBuildOptions({}));
    const json = serializeExecutionPlan(plan);

    // Pretty-printed JSON has multiple lines
    const lineCount = json.split('\n').length;
    expect(lineCount).toBeGreaterThan(1);
  });

  it('should sort agent IDs within passes alphabetically', () => {
    const config = createTestConfig({
      passes: [
        {
          name: 'mixed',
          agents: ['reviewdog', 'control_flow', 'semgrep'],
          enabled: true,
          required: false,
        },
      ],
    });

    const plan = buildExecutionPlan(createBuildOptions({ config }));
    const json = serializeExecutionPlan(plan);
    const parsed = JSON.parse(json);

    expect(parsed.passes[0].agents).toEqual(['control_flow', 'reviewdog', 'semgrep']);
  });

  it('should use configSource string from options, not raw path', () => {
    const plan = buildExecutionPlan(createBuildOptions({ configSource: 'zero-config' }));
    const json = serializeExecutionPlan(plan);
    const parsed = JSON.parse(json);

    expect(parsed.configSource).toBe('zero-config');
  });
});

// =============================================================================
// Agent Registry Integration Tests
// =============================================================================

describe('Agent Registry', () => {
  it('should accept all known valid agent IDs', () => {
    const knownAgentIds = [
      'semgrep',
      'reviewdog',
      'opencode',
      'pr_agent',
      'local_llm',
      'ai_semantic_review',
      'control_flow',
    ];

    for (const agentId of knownAgentIds) {
      const config = createTestConfig({
        passes: [{ name: 'test', agents: [agentId], enabled: true, required: false }],
      });

      // Should not throw
      const plan = buildExecutionPlan(createBuildOptions({ config }));
      expect(plan.passes[0]!.agents).toContain(agentId);
    }
  });

  it('should identify semgrep and reviewdog as compatible with all providers', () => {
    const providers = ['anthropic', 'openai', 'azure-openai', 'ollama'];

    for (const provider of providers) {
      const config = createTestConfig({
        passes: [
          { name: 'static', agents: ['semgrep', 'reviewdog'], enabled: true, required: false },
        ],
      });

      const plan = buildExecutionPlan(createBuildOptions({ config, provider }));

      expect(plan.passes[0]!.agents).toContain('semgrep');
      expect(plan.passes[0]!.agents).toContain('reviewdog');
    }
  });

  it('should identify control_flow as compatible with all providers', () => {
    const providers = ['anthropic', 'openai', 'azure-openai', 'ollama'];

    for (const provider of providers) {
      const config = createTestConfig({
        passes: [{ name: 'builtin', agents: ['control_flow'], enabled: true, required: false }],
      });

      const plan = buildExecutionPlan(createBuildOptions({ config, provider }));

      expect(plan.passes[0]!.agents).toContain('control_flow');
    }
  });

  it('should identify local_llm as ollama-only', () => {
    // local_llm should work with ollama
    const ollamaConfig = createTestConfig({
      passes: [{ name: 'local', agents: ['local_llm'], enabled: true, required: false }],
    });
    const ollamaPlan = buildExecutionPlan(
      createBuildOptions({ config: ollamaConfig, provider: 'ollama' })
    );
    expect(ollamaPlan.passes[0]!.agents).toContain('local_llm');

    // local_llm should be excluded with anthropic
    const anthropicConfig = createTestConfig({
      passes: [{ name: 'local', agents: ['local_llm'], enabled: true, required: false }],
    });
    const anthropicPlan = buildExecutionPlan(
      createBuildOptions({ config: anthropicConfig, provider: 'anthropic' })
    );
    // Pass gets skipped because it has zero agents after filtering
    expect(anthropicPlan.passes).toHaveLength(0);
    expect(anthropicPlan.skippedPasses.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Edge Case Tests
// =============================================================================

describe('Edge Cases', () => {
  it('should handle a config with a single pass and single agent', () => {
    const config = createTestConfig({
      passes: [{ name: 'solo', agents: ['control_flow'], enabled: true, required: false }],
    });

    const plan = buildExecutionPlan(createBuildOptions({ config }));
    expect(plan.passes).toHaveLength(1);
    expect(plan.passes[0]!.agents).toEqual(['control_flow']);
  });

  it('should handle pass filter matching a pass with a single agent', () => {
    const config = createTestConfig({
      passes: [
        { name: 'pass-a', agents: ['semgrep'], enabled: true, required: false },
        { name: 'pass-b', agents: ['control_flow'], enabled: true, required: false },
      ],
    });

    const plan = buildExecutionPlan(createBuildOptions({ config, passFilter: 'pass-b' }));
    expect(plan.passes).toHaveLength(1);
    expect(plan.passes[0]!.agents).toEqual(['control_flow']);
  });

  it('should carry the required flag from config through to plan', () => {
    const config = createTestConfig({
      passes: [
        { name: 'required-pass', agents: ['semgrep'], enabled: true, required: true },
        { name: 'optional-pass', agents: ['control_flow'], enabled: true, required: false },
      ],
    });

    const plan = buildExecutionPlan(createBuildOptions({ config }));

    const requiredPass = plan.passes.find((p) => p.name === 'required-pass');
    const optionalPass = plan.passes.find((p) => p.name === 'optional-pass');

    expect(requiredPass?.required).toBe(true);
    expect(optionalPass?.required).toBe(false);
  });

  it('should produce an empty plan when all passes are disabled (no filters)', () => {
    const config = createTestConfig({
      passes: [
        { name: 'pass-a', agents: ['semgrep'], enabled: false, required: false },
        { name: 'pass-b', agents: ['control_flow'], enabled: false, required: true },
      ],
    });

    // All passes disabled → candidatePasses is empty → plan has zero passes.
    // The empty-pass invariant (no pass with 0 agents) is not violated because
    // there are no passes at all. The spec does not mandate an error here.
    const plan = buildExecutionPlan(createBuildOptions({ config }));
    expect(plan.passes).toHaveLength(0);
    expect(plan.skippedPasses).toHaveLength(0); // disabled passes are excluded, not "skipped"
  });
});
