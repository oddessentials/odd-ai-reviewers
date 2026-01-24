/**
 * Configuration Module
 *
 * Loads and validates .ai-review.yml files.
 * Schemas and provider logic are in ./config/ submodules.
 */

import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';
import { existsSync } from 'fs';
import { join } from 'path';

// Re-export everything from config submodules for backward compatibility
export {
  ConfigSchema,
  type Config,
  type Pass,
  type Limits,
  type Models,
  type AgentId,
} from './config/schemas.js';

export {
  type LlmProvider,
  inferProviderFromModel,
  resolveEffectiveModel,
  resolveProvider,
} from './config/providers.js';

// Import for internal use
import { ConfigSchema, type Config, type AgentId } from './config/schemas.js';

const CONFIG_FILENAME = '.ai-review.yml';
const DEFAULTS_PATH = join(import.meta.dirname, '../../config/defaults.ai-review.yml');

/**
 * Load configuration from the target repository
 * Falls back to defaults if no config file exists
 */
export async function loadConfig(repoRoot: string): Promise<Config> {
  const configPath = join(repoRoot, CONFIG_FILENAME);

  let userConfig: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    const content = await readFile(configPath, 'utf-8');
    userConfig = parseYaml(content) as Record<string, unknown>;
    console.log(`[config] Loaded ${CONFIG_FILENAME} from repository`);
  } else {
    // Enterprise-grade warning: explicit opt-in for AI agents
    console.warn(
      `[config] ⚠️  No ${CONFIG_FILENAME} found. Running static analysis (Semgrep) only.`
    );
    console.warn(
      `[config] To enable AI agents (local_llm, OpenCode, PR-Agent), add ${CONFIG_FILENAME} to your repository.`
    );
    console.warn(`[config] See: https://github.com/oddessentials/odd-ai-reviewers#configuration`);
  }

  // Load defaults and merge with user config
  let defaults: Record<string, unknown> = {};
  if (existsSync(DEFAULTS_PATH)) {
    const defaultsContent = await readFile(DEFAULTS_PATH, 'utf-8');
    defaults = parseYaml(defaultsContent) as Record<string, unknown>;
  }

  const merged = deepMerge(defaults, userConfig);

  // Validate and return
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Deep merge two objects, with source taking precedence
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Get the list of enabled agents for a specific pass
 */
export function getEnabledAgents(config: Config, passName: string): AgentId[] {
  const pass = config.passes.find((p) => p.name === passName);
  if (!pass || !pass.enabled) {
    return [];
  }
  return pass.agents;
}
