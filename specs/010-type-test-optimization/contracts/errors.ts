/**
 * Error Type Contracts
 * Feature: 010-type-test-optimization
 *
 * This file defines the type contracts for custom error handling.
 * Implementation must conform to these interfaces.
 */

import { z } from 'zod';

// =============================================================================
// Error Wire Format (Serialization Contract)
// =============================================================================

/**
 * Canonical error wire format for JSON serialization
 * All custom errors must round-trip through this format without data loss
 */
export const ErrorWireFormatSchema: z.ZodType<ErrorWireFormat> = z.lazy(() =>
  z.object({
    /** Error class name (e.g., "ConfigError") */
    name: z.string().min(1),
    /** Machine-readable error code (e.g., "CONFIG_INVALID_SCHEMA") */
    code: z.string().regex(/^[A-Z]+_[A-Z_]+$/),
    /** Human-readable error message */
    message: z.string(),
    /** Nested cause error (recursive, max 10 levels enforced at runtime) */
    cause: ErrorWireFormatSchema.optional(),
    /** Domain-specific metadata (must be JSON-serializable) */
    context: z.record(z.unknown()),
    /** Stack trace (preserved through serialization) */
    stack: z.string().optional(),
  })
);

export type ErrorWireFormat = {
  name: string;
  code: string;
  message: string;
  cause?: ErrorWireFormat;
  context: Record<string, unknown>;
  stack?: string;
};

// =============================================================================
// Error Code Enums
// =============================================================================

/** Configuration error codes */
export const ConfigErrorCode = {
  INVALID_SCHEMA: 'CONFIG_INVALID_SCHEMA',
  MISSING_FIELD: 'CONFIG_MISSING_FIELD',
  INVALID_VALUE: 'CONFIG_INVALID_VALUE',
  FILE_NOT_FOUND: 'CONFIG_FILE_NOT_FOUND',
  PARSE_ERROR: 'CONFIG_PARSE_ERROR',
} as const;

export type ConfigErrorCode = (typeof ConfigErrorCode)[keyof typeof ConfigErrorCode];

/** Agent error codes */
export const AgentErrorCode = {
  EXECUTION_FAILED: 'AGENT_EXECUTION_FAILED',
  TIMEOUT: 'AGENT_TIMEOUT',
  PARSE_ERROR: 'AGENT_PARSE_ERROR',
  NOT_FOUND: 'AGENT_NOT_FOUND',
  DISABLED: 'AGENT_DISABLED',
} as const;

export type AgentErrorCode = (typeof AgentErrorCode)[keyof typeof AgentErrorCode];

/** Network error codes */
export const NetworkErrorCode = {
  CONNECTION_FAILED: 'NETWORK_CONNECTION_FAILED',
  TIMEOUT: 'NETWORK_TIMEOUT',
  AUTH_FAILED: 'NETWORK_AUTH_FAILED',
  RATE_LIMITED: 'NETWORK_RATE_LIMITED',
  SERVER_ERROR: 'NETWORK_SERVER_ERROR',
  INVALID_RESPONSE: 'NETWORK_INVALID_RESPONSE',
} as const;

export type NetworkErrorCode = (typeof NetworkErrorCode)[keyof typeof NetworkErrorCode];

/** Validation error codes */
export const ValidationErrorCode = {
  INVALID_INPUT: 'VALIDATION_INVALID_INPUT',
  INVALID_GIT_REF: 'VALIDATION_INVALID_GIT_REF',
  INVALID_PATH: 'VALIDATION_INVALID_PATH',
  CONSTRAINT_VIOLATED: 'VALIDATION_CONSTRAINT_VIOLATED',
} as const;

export type ValidationErrorCode = (typeof ValidationErrorCode)[keyof typeof ValidationErrorCode];

// =============================================================================
// Error Context Types
// =============================================================================

/** Context for configuration errors */
export interface ConfigErrorContext {
  path?: string;
  field?: string;
  expected?: string;
  actual?: unknown;
}

/** Context for agent errors */
export interface AgentErrorContext {
  agentId: string;
  phase?: string;
  input?: unknown;
}

/** Context for network errors */
export interface NetworkErrorContext {
  url?: string;
  status?: number;
  provider?: string;
}

/** Context for validation errors */
export interface ValidationErrorContext {
  field: string;
  value?: unknown;
  constraint?: string;
}

// =============================================================================
// Base Error Contract
// =============================================================================

/**
 * Base error class contract
 * All custom errors must extend this class
 */
export interface BaseErrorContract {
  /** Error name (class name) */
  readonly name: string;
  /** Machine-readable error code */
  readonly code: string;
  /** Human-readable message */
  readonly message: string;
  /** Original cause (if wrapping another error) */
  readonly cause?: Error;
  /** Domain-specific context */
  readonly context: Record<string, unknown>;
  /** Stack trace */
  readonly stack?: string;

  /** Serialize to wire format */
  toWireFormat(): ErrorWireFormat;
}

/**
 * Static methods required on error classes
 */
export interface BaseErrorStatic {
  /** Deserialize from wire format */
  fromWireFormat(wire: ErrorWireFormat): BaseErrorContract;
}

// =============================================================================
// Specific Error Contracts
// =============================================================================

export interface ConfigErrorContract extends BaseErrorContract {
  readonly code: ConfigErrorCode;
  readonly context: ConfigErrorContext;
}

export interface AgentErrorContract extends BaseErrorContract {
  readonly code: AgentErrorCode;
  readonly context: AgentErrorContext;
}

export interface NetworkErrorContract extends BaseErrorContract {
  readonly code: NetworkErrorCode;
  readonly context: NetworkErrorContext;
}

export interface ValidationErrorContract extends BaseErrorContract {
  readonly code: ValidationErrorCode;
  readonly context: ValidationErrorContext;
}

// =============================================================================
// Type Guards
// =============================================================================

export function isConfigError(error: unknown): error is ConfigErrorContract {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('CONFIG_')
  );
}

export function isAgentError(error: unknown): error is AgentErrorContract {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('AGENT_')
  );
}

export function isNetworkError(error: unknown): error is NetworkErrorContract {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('NETWORK_')
  );
}

export function isValidationError(error: unknown): error is ValidationErrorContract {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('VALIDATION_')
  );
}
