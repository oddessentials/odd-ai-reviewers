/**
 * Custom Error Types with Canonical Wire Format
 *
 * This module provides:
 * - ErrorWireFormat: Canonical JSON serialization format for all errors
 * - BaseError: Abstract base class for all custom errors
 * - ConfigError, AgentError, NetworkError, ValidationError: Domain-specific error classes
 * - Type guards for runtime error type checking
 *
 * All errors support round-trip serialization through toWireFormat()/fromWireFormat()
 * without losing cause chains or stack traces.
 */

import { z } from 'zod';

// =============================================================================
// Error Wire Format Schema (Single Source of Truth)
// =============================================================================

/**
 * Wire format type for error serialization
 */
export interface ErrorWireFormat {
  name: string;
  code: string;
  message: string;
  cause?: ErrorWireFormat;
  context: Record<string, unknown>;
  stack?: string;
}

/**
 * Canonical error wire format for JSON serialization
 *
 * Note: We use a base schema with cause as unknown, then validate recursively
 * at runtime. This avoids Zod 4's z.lazy() complexity while maintaining
 * full type safety.
 */
const BaseWireFormatSchema = z.object({
  /** Error class name (e.g., "ConfigError") */
  name: z.string().min(1),
  /** Machine-readable error code (e.g., "CONFIG_INVALID_SCHEMA") */
  code: z.string().regex(/^[A-Z]+_[A-Z_]+$/),
  /** Human-readable error message */
  message: z.string(),
  /** Nested cause error (validated recursively at runtime) */
  cause: z.unknown().optional(),
  /** Domain-specific metadata (must be JSON-serializable) */
  context: z.record(z.string(), z.unknown()),
  /** Stack trace (preserved through serialization) */
  stack: z.string().optional(),
});

/** Maximum depth for cause chain serialization (prevents infinite recursion) */
const MAX_CAUSE_DEPTH = 10;

/**
 * Validate an ErrorWireFormat recursively
 */
function validateErrorWireFormat(value: unknown, depth = 0): ErrorWireFormat {
  if (depth > MAX_CAUSE_DEPTH) {
    throw new Error('Cause chain exceeds maximum depth');
  }

  const result = BaseWireFormatSchema.parse(value);

  // Recursively validate cause if present
  const validatedCause = result.cause
    ? validateErrorWireFormat(result.cause, depth + 1)
    : undefined;

  return {
    name: result.name,
    code: result.code,
    message: result.message,
    cause: validatedCause,
    context: result.context,
    stack: result.stack,
  };
}

/**
 * Schema for validating ErrorWireFormat
 * Wraps the base schema with recursive cause validation
 */
export const ErrorWireFormatSchema = BaseWireFormatSchema.transform((val) => {
  // Recursively validate and transform the cause chain
  const cause = val.cause ? validateErrorWireFormat(val.cause) : undefined;
  return {
    name: val.name,
    code: val.code,
    message: val.message,
    cause,
    context: val.context,
    stack: val.stack,
  } as ErrorWireFormat;
});

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
export interface ConfigErrorContext extends Record<string, unknown> {
  path?: string;
  field?: string;
  expected?: string;
  actual?: unknown;
}

/** Context for agent errors */
export interface AgentErrorContext extends Record<string, unknown> {
  agentId: string;
  phase?: string;
  input?: unknown;
}

/** Context for network errors */
export interface NetworkErrorContext extends Record<string, unknown> {
  url?: string;
  status?: number;
  provider?: string;
}

/** Context for validation errors */
export interface ValidationErrorContext extends Record<string, unknown> {
  field: string;
  value?: unknown;
  constraint?: string;
}

// =============================================================================
// Base Error Class
// =============================================================================

/**
 * Abstract base class for all custom errors
 *
 * Provides:
 * - Consistent error structure with code and context
 * - Serialization to/from canonical wire format
 * - Proper cause chain handling
 * - Stack trace preservation
 */
export abstract class BaseError extends Error {
  abstract readonly code: string;
  abstract readonly context: Record<string, unknown>;

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = this.constructor.name;

    // Capture stack trace, excluding constructor
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error to canonical wire format
   *
   * @param depth - Current recursion depth (internal use)
   * @returns ErrorWireFormat object suitable for JSON serialization
   */
  toWireFormat(depth = 0): ErrorWireFormat {
    const wire: ErrorWireFormat = {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };

    if (this.stack) {
      wire.stack = this.stack;
    }

    // Recursively serialize cause chain (with depth limit)
    if (this.cause && depth < MAX_CAUSE_DEPTH) {
      if (this.cause instanceof BaseError) {
        wire.cause = this.cause.toWireFormat(depth + 1);
      } else if (this.cause instanceof Error) {
        // Handle non-BaseError causes
        wire.cause = {
          name: this.cause.name,
          code: 'UNKNOWN_ERROR',
          message: this.cause.message,
          context: {},
          stack: this.cause.stack,
        };
      }
    }

    return wire;
  }
}

// =============================================================================
// Config Error
// =============================================================================

/**
 * Error for configuration-related failures
 *
 * Use for:
 * - Schema validation errors
 * - Missing configuration files
 * - Invalid configuration values
 * - Configuration parsing failures
 */
export class ConfigError extends BaseError {
  readonly code: ConfigErrorCode;
  readonly context: ConfigErrorContext;

  constructor(
    message: string,
    code: ConfigErrorCode,
    context: ConfigErrorContext = {},
    options?: { cause?: Error }
  ) {
    super(message, options);
    this.code = code;
    this.context = context;
  }

  /**
   * Deserialize ConfigError from wire format
   */
  static fromWireFormat(wire: ErrorWireFormat): ConfigError {
    const cause = wire.cause ? ConfigError.causeFromWireFormat(wire.cause) : undefined;

    const error = new ConfigError(
      wire.message,
      wire.code as ConfigErrorCode,
      wire.context as ConfigErrorContext,
      cause ? { cause } : undefined
    );

    // Restore stack trace if available
    if (wire.stack) {
      error.stack = wire.stack;
    }

    return error;
  }

  private static causeFromWireFormat(wire: ErrorWireFormat): Error {
    // Recursively reconstruct cause chain
    if (wire.code.startsWith('CONFIG_')) {
      return ConfigError.fromWireFormat(wire);
    }
    if (wire.code.startsWith('AGENT_')) {
      return AgentError.fromWireFormat(wire);
    }
    if (wire.code.startsWith('NETWORK_')) {
      return NetworkError.fromWireFormat(wire);
    }
    if (wire.code.startsWith('VALIDATION_')) {
      return ValidationError.fromWireFormat(wire);
    }
    // Fallback: create generic error
    const error = new Error(wire.message);
    error.name = wire.name;
    if (wire.stack) {
      error.stack = wire.stack;
    }
    return error;
  }
}

// =============================================================================
// Agent Error
// =============================================================================

/**
 * Error for agent execution failures
 *
 * Use for:
 * - Agent execution failures
 * - Agent timeouts
 * - Agent output parsing errors
 * - Agent not found
 */
export class AgentError extends BaseError {
  readonly code: AgentErrorCode;
  readonly context: AgentErrorContext;

  constructor(
    message: string,
    code: AgentErrorCode,
    context: AgentErrorContext,
    options?: { cause?: Error }
  ) {
    super(message, options);
    this.code = code;
    this.context = context;
  }

  /**
   * Deserialize AgentError from wire format
   */
  static fromWireFormat(wire: ErrorWireFormat): AgentError {
    const cause = wire.cause ? AgentError.causeFromWireFormat(wire.cause) : undefined;

    const context = wire.context as AgentErrorContext;
    // Ensure required field exists
    if (!context.agentId) {
      context.agentId = 'unknown';
    }

    const error = new AgentError(
      wire.message,
      wire.code as AgentErrorCode,
      context,
      cause ? { cause } : undefined
    );

    if (wire.stack) {
      error.stack = wire.stack;
    }

    return error;
  }

  private static causeFromWireFormat(wire: ErrorWireFormat): Error {
    if (wire.code.startsWith('CONFIG_')) {
      return ConfigError.fromWireFormat(wire);
    }
    if (wire.code.startsWith('AGENT_')) {
      return AgentError.fromWireFormat(wire);
    }
    if (wire.code.startsWith('NETWORK_')) {
      return NetworkError.fromWireFormat(wire);
    }
    if (wire.code.startsWith('VALIDATION_')) {
      return ValidationError.fromWireFormat(wire);
    }
    const error = new Error(wire.message);
    error.name = wire.name;
    if (wire.stack) {
      error.stack = wire.stack;
    }
    return error;
  }
}

// =============================================================================
// Network Error
// =============================================================================

/**
 * Error for network-related failures
 *
 * Use for:
 * - API connection failures
 * - Network timeouts
 * - Authentication failures
 * - Rate limiting
 * - Server errors
 */
export class NetworkError extends BaseError {
  readonly code: NetworkErrorCode;
  readonly context: NetworkErrorContext;

  constructor(
    message: string,
    code: NetworkErrorCode,
    context: NetworkErrorContext = {},
    options?: { cause?: Error }
  ) {
    super(message, options);
    this.code = code;
    this.context = context;
  }

  /**
   * Deserialize NetworkError from wire format
   */
  static fromWireFormat(wire: ErrorWireFormat): NetworkError {
    const cause = wire.cause ? NetworkError.causeFromWireFormat(wire.cause) : undefined;

    const error = new NetworkError(
      wire.message,
      wire.code as NetworkErrorCode,
      wire.context as NetworkErrorContext,
      cause ? { cause } : undefined
    );

    if (wire.stack) {
      error.stack = wire.stack;
    }

    return error;
  }

  private static causeFromWireFormat(wire: ErrorWireFormat): Error {
    if (wire.code.startsWith('CONFIG_')) {
      return ConfigError.fromWireFormat(wire);
    }
    if (wire.code.startsWith('AGENT_')) {
      return AgentError.fromWireFormat(wire);
    }
    if (wire.code.startsWith('NETWORK_')) {
      return NetworkError.fromWireFormat(wire);
    }
    if (wire.code.startsWith('VALIDATION_')) {
      return ValidationError.fromWireFormat(wire);
    }
    const error = new Error(wire.message);
    error.name = wire.name;
    if (wire.stack) {
      error.stack = wire.stack;
    }
    return error;
  }
}

// =============================================================================
// Validation Error
// =============================================================================

/**
 * Error for input validation failures
 *
 * Use for:
 * - Invalid input data
 * - Invalid git references
 * - Invalid file paths
 * - Constraint violations
 */
export class ValidationError extends BaseError {
  readonly code: ValidationErrorCode;
  readonly context: ValidationErrorContext;

  constructor(
    message: string,
    code: ValidationErrorCode,
    context: ValidationErrorContext,
    options?: { cause?: Error }
  ) {
    super(message, options);
    this.code = code;
    this.context = context;
  }

  /**
   * Deserialize ValidationError from wire format
   */
  static fromWireFormat(wire: ErrorWireFormat): ValidationError {
    const cause = wire.cause ? ValidationError.causeFromWireFormat(wire.cause) : undefined;

    const context = wire.context as ValidationErrorContext;
    // Ensure required field exists
    if (!context.field) {
      context.field = 'unknown';
    }

    const error = new ValidationError(
      wire.message,
      wire.code as ValidationErrorCode,
      context,
      cause ? { cause } : undefined
    );

    if (wire.stack) {
      error.stack = wire.stack;
    }

    return error;
  }

  private static causeFromWireFormat(wire: ErrorWireFormat): Error {
    if (wire.code.startsWith('CONFIG_')) {
      return ConfigError.fromWireFormat(wire);
    }
    if (wire.code.startsWith('AGENT_')) {
      return AgentError.fromWireFormat(wire);
    }
    if (wire.code.startsWith('NETWORK_')) {
      return NetworkError.fromWireFormat(wire);
    }
    if (wire.code.startsWith('VALIDATION_')) {
      return ValidationError.fromWireFormat(wire);
    }
    const error = new Error(wire.message);
    error.name = wire.name;
    if (wire.stack) {
      error.stack = wire.stack;
    }
    return error;
  }
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for ConfigError
 */
export function isConfigError(error: unknown): error is ConfigError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('CONFIG_')
  );
}

/**
 * Type guard for AgentError
 */
export function isAgentError(error: unknown): error is AgentError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('AGENT_')
  );
}

/**
 * Type guard for NetworkError
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('NETWORK_')
  );
}

/**
 * Type guard for ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('VALIDATION_')
  );
}

/**
 * Type guard for any BaseError subclass
 */
export function isBaseError(error: unknown): error is BaseError {
  return (
    isConfigError(error) || isAgentError(error) || isNetworkError(error) || isValidationError(error)
  );
}

/**
 * Deserialize any error from wire format
 * Determines the correct error class based on the code prefix
 */
export function errorFromWireFormat(wire: ErrorWireFormat): BaseError {
  if (wire.code.startsWith('CONFIG_')) {
    return ConfigError.fromWireFormat(wire);
  }
  if (wire.code.startsWith('AGENT_')) {
    return AgentError.fromWireFormat(wire);
  }
  if (wire.code.startsWith('NETWORK_')) {
    return NetworkError.fromWireFormat(wire);
  }
  if (wire.code.startsWith('VALIDATION_')) {
    return ValidationError.fromWireFormat(wire);
  }
  // Default to ValidationError for unknown codes
  return ValidationError.fromWireFormat({
    ...wire,
    code: ValidationErrorCode.INVALID_INPUT,
    context: { field: 'unknown', ...wire.context },
  });
}
