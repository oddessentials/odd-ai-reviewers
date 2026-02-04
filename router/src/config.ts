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
import { ConfigError, ConfigErrorCode, isNodeError } from './types/errors.js';
import { type ValidatedConfig, createValidatedConfigHelpers } from './types/branded.js';
import { type Result, Err } from './types/result.js';

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
  type ResolvedConfigTuple,
  RESOLVED_CONFIG_SCHEMA_VERSION,
  RESOLVED_CONFIG_RESOLUTION_VERSION,
  inferProviderFromModel,
  isCompletionsOnlyModel,
  resolveEffectiveModel,
  resolveProvider,
  resolveKeySource,
  resolveConfigSource,
  buildResolvedConfigTuple,
} from './config/providers.js';

// Re-export zero-config functionality
export {
  type ProviderDetectionResult,
  type ZeroConfigResult,
  type NoCredentialsResult,
  type GenerateZeroConfigResult,
  ZERO_CONFIG_LIMITS,
  ZERO_CONFIG_PASS_NAME,
  detectProvider,
  detectProviderWithDetails,
  generateZeroConfigDefaults,
  isZeroConfigSuccess,
  formatZeroConfigMessage,
  getZeroConfigDescription,
} from './config/zero-config.js';

// Import for internal use
import { ConfigSchema, type Config, type AgentId } from './config/schemas.js';

// Create ValidatedConfig helpers for Config type
const ValidatedConfigHelpers = createValidatedConfigHelpers(ConfigSchema);

/** Validated configuration type - branded to guarantee validation has occurred */
export type ValidatedReviewConfig = ValidatedConfig<Config>;

const CONFIG_FILENAME = '.ai-review.yml';
const DEFAULTS_PATH = join(import.meta.dirname, '../../config/defaults.ai-review.yml');

/**
 * Load configuration from the target repository
 * Falls back to defaults if no config file exists
 *
 * @returns ValidatedConfig<Config> - Configuration validated through Zod schema
 */
export async function loadConfig(repoRoot: string): Promise<ValidatedConfig<Config>> {
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

  // Validate and return branded config
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues;
    throw new ConfigError(
      `Invalid configuration: ${result.error.message}`,
      ConfigErrorCode.INVALID_SCHEMA,
      {
        path: configPath,
        field: issues[0]?.path?.join('.'),
        expected: issues[0]?.message,
      }
    );
  }

  // Brand the validated config - guarantees it passed schema validation
  return ValidatedConfigHelpers.brand(result.data);
}

/**
 * Load configuration from an explicit file path.
 *
 * @param configPath - Absolute or relative path to a config file
 * @returns ValidatedConfig<Config> - Configuration validated through Zod schema
 */
export async function loadConfigFromPath(configPath: string): Promise<ValidatedConfig<Config>> {
  let content: string;
  try {
    content = await readFile(configPath, 'utf-8');
  } catch (err) {
    // Use type guard for safe error property access
    if (isNodeError(err)) {
      if (err.code === 'ENOENT') {
        throw new ConfigError(
          `Config file not found: ${configPath}`,
          ConfigErrorCode.FILE_NOT_FOUND,
          { path: configPath }
        );
      }
      if (err.code === 'EACCES') {
        throw new ConfigError(
          `Config file unreadable (permission denied): ${configPath}`,
          ConfigErrorCode.FILE_UNREADABLE,
          { path: configPath }
        );
      }
    }
    // Re-throw original error (preserves stack trace for unexpected errors)
    throw err;
  }

  // Parse YAML with distinct error handling
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    throw new ConfigError(
      `Failed to parse YAML: ${err instanceof Error ? err.message : 'Unknown error'}`,
      ConfigErrorCode.YAML_PARSE_ERROR,
      { path: configPath },
      err instanceof Error ? { cause: err } : undefined
    );
  }
  const userConfig =
    parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};

  // Load defaults and merge with user config
  let defaults: Record<string, unknown> = {};
  if (existsSync(DEFAULTS_PATH)) {
    const defaultsContent = await readFile(DEFAULTS_PATH, 'utf-8');
    defaults = parseYaml(defaultsContent) as Record<string, unknown>;
  }

  const merged = deepMerge(defaults, userConfig);

  // Validate and return branded config
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues;
    throw new ConfigError(
      `Invalid configuration: ${result.error.message}`,
      ConfigErrorCode.INVALID_SCHEMA,
      {
        path: configPath,
        field: issues[0]?.path?.join('.'),
        expected: issues[0]?.message,
      }
    );
  }

  return ValidatedConfigHelpers.brand(result.data);
}

/**
 * Load configuration, returning a Result instead of throwing.
 *
 * This is the Result-returning version for explicit error handling.
 *
 * @param repoRoot - Repository root path
 * @returns Result<ValidatedConfig<Config>, ConfigError>
 */
export async function loadConfigResult(
  repoRoot: string
): Promise<Result<ValidatedConfig<Config>, ConfigError>> {
  try {
    const config = await loadConfig(repoRoot);
    return { ok: true, value: config };
  } catch (error) {
    if (error instanceof ConfigError) {
      return Err(error);
    }
    // Wrap unexpected errors
    return Err(
      new ConfigError(
        error instanceof Error ? error.message : 'Unknown configuration error',
        ConfigErrorCode.PARSE_ERROR,
        {}
      )
    );
  }
}

/**
 * Deep merge two objects, with source taking precedence.
 * Exported for use in config init validation to match loadConfig behavior.
 */
export function deepMerge(
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
 * Load the defaults configuration file.
 * Used by config init to merge defaults before validation, matching loadConfig behavior.
 *
 * @returns Parsed defaults object, or empty object if defaults file not found
 */
export async function loadDefaults(): Promise<Record<string, unknown>> {
  if (existsSync(DEFAULTS_PATH)) {
    const defaultsContent = await readFile(DEFAULTS_PATH, 'utf-8');
    return parseYaml(defaultsContent) as Record<string, unknown>;
  }
  return {};
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

// =============================================================================
// Local Review Mode Config Loading (with Zero-Config Fallback)
// =============================================================================

// Import zero-config utilities for internal use
import {
  generateZeroConfigDefaults,
  isZeroConfigSuccess,
  type ZeroConfigResult,
  type NoCredentialsResult,
} from './config/zero-config.js';

/**
 * Result of loading config for local review mode
 */
export interface LocalConfigResult {
  /** Loaded configuration */
  config: ValidatedConfig<Config>;
  /** Configuration source information */
  source: {
    /** Where config came from */
    type: 'file' | 'zero-config';
    /** Path to config file if file source */
    path?: string;
    /** Zero-config details if zero-config source */
    zeroConfig?: {
      provider: string;
      keySource: string;
      ignoredProviders: { provider: string; keySource: string }[];
    };
  };
}

/**
 * Error result when config loading fails
 */
export interface LocalConfigError {
  /** No configuration available */
  config: null;
  /** Error information */
  error: {
    /** Error type */
    type: 'no_credentials' | 'invalid_config' | 'parse_error';
    /** Error message */
    message: string;
    /** Guidance for the user */
    guidance: string[];
  };
}

/**
 * Load configuration for local review mode with zero-config fallback.
 *
 * Unlike loadConfig() which falls back to static-only analysis,
 * this function attempts to generate a zero-config configuration
 * when no .ai-review.yml exists.
 *
 * @param repoRoot - Repository root path
 * @param env - Environment variables for provider detection
 * @returns Config result or error
 */
export async function loadConfigForLocalReview(
  repoRoot: string,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): Promise<LocalConfigResult | LocalConfigError> {
  const configPath = join(repoRoot, CONFIG_FILENAME);

  // Try to load config file first
  if (existsSync(configPath)) {
    try {
      const content = await readFile(configPath, 'utf-8');
      const userConfig = parseYaml(content) as Record<string, unknown>;

      // Load defaults and merge with user config
      let defaults: Record<string, unknown> = {};
      if (existsSync(DEFAULTS_PATH)) {
        const defaultsContent = await readFile(DEFAULTS_PATH, 'utf-8');
        defaults = parseYaml(defaultsContent) as Record<string, unknown>;
      }

      const merged = deepMerge(defaults, userConfig);

      // Validate
      const result = ConfigSchema.safeParse(merged);
      if (!result.success) {
        const issues = result.error.issues;
        return {
          config: null,
          error: {
            type: 'invalid_config',
            message: `Invalid configuration: ${issues[0]?.message || 'Unknown error'}`,
            guidance: [
              `Check your ${CONFIG_FILENAME} file for errors.`,
              `Field: ${issues[0]?.path?.join('.') || 'unknown'}`,
              'Run "ai-review config validate" to check your configuration.',
            ],
          },
        };
      }

      return {
        config: ValidatedConfigHelpers.brand(result.data),
        source: {
          type: 'file',
          path: configPath,
        },
      };
    } catch (error) {
      return {
        config: null,
        error: {
          type: 'parse_error',
          message: error instanceof Error ? error.message : 'Failed to parse configuration',
          guidance: [
            'Check that your .ai-review.yml file contains valid YAML.',
            'Run "ai-review config validate" to validate your configuration.',
          ],
        },
      };
    }
  }

  // No config file - attempt zero-config generation
  const zeroConfigResult = generateZeroConfigDefaults(env);

  if (!isZeroConfigSuccess(zeroConfigResult)) {
    // Cast to NoCredentialsResult for TypeScript
    const noCredsResult = zeroConfigResult as NoCredentialsResult;
    return {
      config: null,
      error: {
        type: 'no_credentials',
        message: noCredsResult.error,
        guidance: noCredsResult.guidance,
      },
    };
  }

  // Cast to ZeroConfigResult for TypeScript
  const successResult = zeroConfigResult as ZeroConfigResult;

  // Validate the generated config (should always pass)
  const validated = ConfigSchema.safeParse(successResult.config);
  if (!validated.success) {
    // This should never happen - indicates a bug in zero-config generation
    return {
      config: null,
      error: {
        type: 'invalid_config',
        message: 'Internal error: Generated zero-config is invalid',
        guidance: [
          'Please report this bug at https://github.com/oddessentials/odd-ai-reviewers/issues',
        ],
      },
    };
  }

  return {
    config: ValidatedConfigHelpers.brand(validated.data),
    source: {
      type: 'zero-config',
      zeroConfig: {
        provider: successResult.provider,
        keySource: successResult.keySource,
        ignoredProviders: successResult.ignoredProviders,
      },
    },
  };
}

/**
 * Check if local config result is successful
 */
export function isLocalConfigSuccess(
  result: LocalConfigResult | LocalConfigError
): result is LocalConfigResult {
  return result.config !== null;
}
