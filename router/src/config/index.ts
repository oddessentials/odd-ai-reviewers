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
  type Config,
  type Pass,
  type Limits,
  type Models,
  type AgentId,
} from './schemas.js';

// Re-export provider types and functions
export {
  type LlmProvider,
  inferProviderFromModel,
  resolveEffectiveModel,
  resolveProvider,
} from './providers.js';
