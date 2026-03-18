/**
 * Execution Plan Module (FR-001 through FR-007)
 *
 * Produces a single, immutable ExecutionPlan object that is the sole source of truth
 * for all downstream code paths (dry-run, cost-only, dependency check, execution).
 *
 * Pipeline: Parse -> Validate -> BuildExecutionPlan -> DependencyCheck -> Execute
 *
 * No downstream consumer may read raw CLI flags — they operate on the plan.
 */

import type { Config, Pass, AgentId } from '../config/schemas.js';
import {
  AGENT_REGISTRY,
  getAgentById,
  getCompatibleAgents,
  type AgentRegistryEntry,
} from '../config/schemas.js';
import { ConfigError, ConfigErrorCode } from '../types/errors.js';
import { assertNever } from '../types/assert-never.js';

// =============================================================================
// DeepReadonly Utility
// =============================================================================

/**
 * Recursively makes all properties readonly.
 * Arrays become ReadonlyArrays, objects get readonly properties.
 */
export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

// =============================================================================
// RunStatus (Canonical Enum)
// =============================================================================

/**
 * Machine-readable status for all JSON/SARIF output.
 * Strict 1:1 mapping with exit codes.
 */
export type RunStatus = 'complete' | 'gating_failed' | 'config_error' | 'incomplete';

/**
 * The ONLY path to produce an exit code.
 * No call site may hardcode an exit code number directly.
 */
export function exitCodeFromStatus(status: RunStatus): number {
  switch (status) {
    case 'complete':
      return 0;
    case 'gating_failed':
      return 1;
    case 'config_error':
      return 2;
    case 'incomplete':
      return 3;
    default:
      return assertNever(status);
  }
}

// =============================================================================
// Execution Plan Types
// =============================================================================

/**
 * Execution mode for the review.
 */
export type ExecutionMode = 'execute' | 'dry-run' | 'cost-only';

/**
 * A pass with zero agents has been removed and recorded here.
 */
export interface SkippedPass {
  readonly name: string;
  readonly reason: string;
}

/**
 * A single pass within the execution plan with its resolved agents.
 */
export interface PlannedPass {
  readonly name: string;
  readonly agents: readonly AgentId[];
  readonly required: boolean;
}

/**
 * Gating configuration snapshot for the plan.
 */
export interface PlanGating {
  readonly enabled: boolean;
  readonly failOnSeverity: string;
  readonly driftGate: boolean;
}

/**
 * Limits configuration snapshot for the plan.
 */
export interface PlanLimits {
  readonly maxDiffLines: number;
  readonly maxFiles: number;
  readonly maxTokensPerPr: number;
  readonly maxUsdPerPr: number;
}

/**
 * Immutable execution plan — single source of truth for all downstream consumers.
 *
 * Structural invariant: No pass may have an empty agents list.
 */
export interface ExecutionPlan {
  readonly mode: ExecutionMode;
  readonly passes: readonly PlannedPass[];
  readonly skippedPasses: readonly SkippedPass[];
  readonly provider: string | null;
  readonly model: string | null;
  readonly limits: PlanLimits;
  readonly gating: PlanGating;
  readonly configSource: string;
  readonly schemaVersion: number;
}

// =============================================================================
// Build Options
// =============================================================================

/**
 * Options for building an execution plan from CLI args and config.
 */
export interface BuildPlanOptions {
  /** The loaded configuration */
  config: Config;
  /** Execution mode */
  mode: ExecutionMode;
  /** --pass filter (undefined = all passes) */
  passFilter?: string;
  /** --agent filter (undefined = all agents) */
  agentFilter?: string;
  /** Resolved provider name */
  provider?: string | null;
  /** Resolved model name */
  model?: string | null;
  /** Config source description (file path or 'zero-config') */
  configSource: string;
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate --pass flag against configured passes.
 * Throws ConfigError if unknown.
 */
function validatePassFilter(passFilter: string, passes: readonly Pass[]): Pass {
  const match = passes.find((p) => p.name === passFilter);
  if (!match) {
    const available = passes.map((p) => p.name).join(', ');
    throw new ConfigError(
      `Unknown pass '${passFilter}'. Available: ${available}`,
      ConfigErrorCode.INVALID_VALUE,
      { field: 'pass', expected: available, actual: passFilter }
    );
  }
  if (!match.enabled) {
    throw new ConfigError(
      `Pass '${passFilter}' is disabled in configuration`,
      ConfigErrorCode.INVALID_VALUE,
      { field: 'pass', actual: passFilter }
    );
  }
  return match;
}

/**
 * Validate --agent flag against the agent registry.
 * Throws ConfigError if unknown.
 */
function validateAgentFilter(agentFilter: string): AgentRegistryEntry {
  const entry = getAgentById(agentFilter);
  if (!entry) {
    const validIds = AGENT_REGISTRY.map((a) => a.id).join(', ');
    throw new ConfigError(
      `Unknown agent '${agentFilter}'. Valid: ${validIds}`,
      ConfigErrorCode.INVALID_VALUE,
      { field: 'agent', expected: validIds, actual: agentFilter }
    );
  }
  return entry;
}

/**
 * Validate pass composition at config time.
 * Checks for unknown agents and duplicates within passes.
 */
function validatePassComposition(passes: readonly Pass[]): void {
  for (const pass of passes) {
    // Check for unknown agents
    for (const agentId of pass.agents) {
      if (!getAgentById(agentId)) {
        const validIds = AGENT_REGISTRY.map((a) => a.id).join(', ');
        throw new ConfigError(
          `Unknown agent '${agentId}' in pass '${pass.name}'. Valid: ${validIds}`,
          ConfigErrorCode.INVALID_VALUE,
          { field: `passes.${pass.name}.agents`, expected: validIds, actual: agentId }
        );
      }
    }

    // Check for duplicates
    const seen = new Set<string>();
    for (const agentId of pass.agents) {
      if (seen.has(agentId)) {
        throw new ConfigError(
          `Duplicate agent '${agentId}' in pass '${pass.name}'`,
          ConfigErrorCode.INVALID_VALUE,
          { field: `passes.${pass.name}.agents`, actual: agentId }
        );
      }
      seen.add(agentId);
    }
  }
}

// =============================================================================
// Build Execution Plan
// =============================================================================

/**
 * Build an immutable execution plan from config and CLI options.
 *
 * Enforces all invariants:
 * - Pass/agent validation against registry
 * - Provider compatibility filtering
 * - Empty-pass rule (required+empty -> ConfigError; optional+empty -> skipped)
 * - Combined --pass + --agent narrowing (FR-007)
 *
 * @throws ConfigError on validation failures (exit code 2)
 */
export function buildExecutionPlan(options: BuildPlanOptions): DeepReadonly<ExecutionPlan> {
  const { config, mode, passFilter, agentFilter, provider, model, configSource } = options;

  // 1. Validate pass composition at config time
  validatePassComposition(config.passes);

  // 2. Start with enabled passes
  let candidatePasses = config.passes.filter((p) => p.enabled);

  // 3. Apply --pass filter
  if (passFilter) {
    const matchedPass = validatePassFilter(passFilter, config.passes);
    candidatePasses = [matchedPass];
  }

  // 4. Validate --agent filter against registry
  if (agentFilter) {
    validateAgentFilter(agentFilter);
  }

  // 5. Get compatible agents for the provider
  const compatibleAgents = getCompatibleAgents(provider);
  const compatibleIds = new Set(compatibleAgents.map((a) => a.id));
  const requestedAgentId = agentFilter as AgentId | undefined;

  // 6. Build planned passes with agent filtering
  const plannedPasses: PlannedPass[] = [];
  const skippedPasses: SkippedPass[] = [];

  for (const pass of candidatePasses) {
    // Filter agents by provider compatibility
    let agents = pass.agents.filter((id) => compatibleIds.has(id));

    // Log provider-incompatible agents as excluded (non-required passes only)
    const excludedByProvider = pass.agents.filter((id) => !compatibleIds.has(id));
    if (excludedByProvider.length > 0 && pass.required) {
      // Required pass with incompatible agents -> config error
      const incompatible = excludedByProvider.join(', ');
      throw new ConfigError(
        `Required pass '${pass.name}' contains agents incompatible with provider '${provider}': ${incompatible}`,
        ConfigErrorCode.INVALID_VALUE,
        { field: `passes.${pass.name}.agents`, actual: incompatible }
      );
    }

    // Apply --agent filter within pass
    if (agentFilter) {
      const passContainsRequestedAgent = pass.agents.includes(requestedAgentId as AgentId);
      if (
        passFilter &&
        passContainsRequestedAgent &&
        !compatibleIds.has(requestedAgentId as AgentId)
      ) {
        throw new ConfigError(
          `Agent '${agentFilter}' in pass '${passFilter}' is incompatible with provider '${provider}'`,
          ConfigErrorCode.INVALID_VALUE,
          { field: 'agent', actual: agentFilter }
        );
      }

      const hasAgent = agents.some((id) => id === agentFilter);
      if (hasAgent) {
        agents = agents.filter((id) => id === agentFilter);
      } else if (passFilter) {
        // Combined: --pass + --agent, agent not in the selected pass
        const otherPasses = config.passes
          .filter((p) => p.enabled && p.agents.includes(agentFilter as AgentId))
          .map((p) => p.name);
        const availableIn =
          otherPasses.length > 0 ? ` It is available in: ${otherPasses.join(', ')}` : '';
        throw new ConfigError(
          `Agent '${agentFilter}' is not configured in pass '${passFilter}'.${availableIn}`,
          ConfigErrorCode.INVALID_VALUE,
          { field: 'agent', actual: agentFilter }
        );
      } else {
        // Agent not in this pass, skip it (will be caught by check below if in no pass)
        agents = [];
      }
    }

    // Empty-pass rule
    if (agents.length === 0) {
      if (pass.required) {
        throw new ConfigError(
          `Required pass '${pass.name}' has no runnable agents after filtering`,
          ConfigErrorCode.INVALID_VALUE,
          { field: `passes.${pass.name}` }
        );
      }
      const reason =
        excludedByProvider.length > 0
          ? `Pass '${pass.name}' skipped: no agents compatible with provider '${provider}'`
          : `Pass '${pass.name}' skipped: no matching agents after filtering`;
      skippedPasses.push({ name: pass.name, reason });
      continue;
    }

    plannedPasses.push({
      name: pass.name,
      agents: agents as AgentId[],
      required: pass.required,
    });
  }

  // 7. If --agent was specified but found in no pass, error
  if (agentFilter && !passFilter && plannedPasses.length === 0) {
    // Check if the agent exists in any configured pass at all
    const passesWithAgent = config.passes
      .filter((p) => p.agents.includes(agentFilter as AgentId))
      .map((p) => p.name);
    if (passesWithAgent.length === 0) {
      throw new ConfigError(
        `Agent '${agentFilter}' not configured in any pass`,
        ConfigErrorCode.INVALID_VALUE,
        { field: 'agent', actual: agentFilter }
      );
    }

    if (!compatibleIds.has(agentFilter as AgentId)) {
      throw new ConfigError(
        `Agent '${agentFilter}' is incompatible with provider '${provider}' and cannot run in configured passes: ${passesWithAgent.join(', ')}`,
        ConfigErrorCode.INVALID_VALUE,
        { field: 'agent', actual: agentFilter }
      );
    }
  }

  // 8. Assert structural invariant: no pass with empty agents
  for (const pass of plannedPasses) {
    if (pass.agents.length === 0) {
      throw new Error(
        `Invariant violation: pass '${pass.name}' has empty agents list in execution plan`
      );
    }
  }

  // 9. Build limits snapshot
  const limits: PlanLimits = {
    maxDiffLines: config.limits.max_diff_lines,
    maxFiles: config.limits.max_files,
    maxTokensPerPr: config.limits.max_tokens_per_pr,
    maxUsdPerPr: config.limits.max_usd_per_pr,
  };

  // 10. Build gating snapshot
  const gating: PlanGating = {
    enabled: config.gating.enabled,
    failOnSeverity: config.gating.fail_on_severity,
    driftGate: config.gating.drift_gate,
  };

  const plan: ExecutionPlan = {
    mode,
    passes: plannedPasses,
    skippedPasses,
    provider: provider ?? null,
    model: model ?? null,
    limits,
    gating,
    configSource,
    schemaVersion: config.version,
  };

  return plan as DeepReadonly<ExecutionPlan>;
}

// =============================================================================
// Plan Serialization (Canonical, Redacted)
// =============================================================================

/**
 * Safe-field allowlist for plan serialization.
 * Only these fields appear in serialized output — everything else is excluded.
 * Keys are emitted in alphabetical order at every level.
 */
export function serializeExecutionPlan(plan: DeepReadonly<ExecutionPlan>): string {
  const canonical = {
    configSource: plan.configSource,
    gating: {
      driftGate: plan.gating.driftGate,
      enabled: plan.gating.enabled,
      failOnSeverity: plan.gating.failOnSeverity,
    },
    limits: {
      maxDiffLines: plan.limits.maxDiffLines,
      maxFiles: plan.limits.maxFiles,
      maxTokensPerPr: plan.limits.maxTokensPerPr,
      maxUsdPerPr: plan.limits.maxUsdPerPr,
    },
    mode: plan.mode,
    model: plan.model,
    passes: plan.passes.map((p) => ({
      agents: [...p.agents].sort(),
      name: p.name,
      required: p.required,
    })),
    provider: plan.provider,
    schemaVersion: plan.schemaVersion,
    ...(plan.skippedPasses.length > 0
      ? {
          skippedPasses: plan.skippedPasses.map((s) => ({
            name: s.name,
            reason: s.reason,
          })),
        }
      : {}),
  };

  return JSON.stringify(canonical, null, 2);
}
