/**
 * Config Module
 *
 * Re-exports from schemas and providers for clean imports.
 */

// Re-export all schemas and types
export {
  ConfigSchema,
  PassSchema,
  LimitsSchema,
  ModelsSchema,
  AgentSchema,
  ProviderSchema,
  type Config,
  type Pass,
  type Limits,
  type Models,
  type AgentId,
  type Provider,
} from './schemas.js';

// Re-export provider types and functions
export {
  type LlmProvider,
  type ResolvedConfigTuple,
  RESOLVED_CONFIG_SCHEMA_VERSION,
  RESOLVED_CONFIG_RESOLUTION_VERSION,
  isCompletionsOnlyModel,
  inferProviderFromModel,
  resolveEffectiveModel,
  resolveProvider,
  resolveKeySource,
  resolveConfigSource,
  buildResolvedConfigTuple,
} from './providers.js';
