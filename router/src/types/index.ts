/**
 * Type Utilities - Barrel Export
 *
 * This module re-exports all type utilities for convenient importing:
 *
 * @example
 * ```typescript
 * import {
 *   // Errors
 *   ConfigError, ConfigErrorCode, isConfigError,
 *   AgentError, AgentErrorCode, isAgentError,
 *   NetworkError, NetworkErrorCode, isNetworkError,
 *   ValidationError, ValidationErrorCode, isValidationError,
 *   ErrorWireFormat, ErrorWireFormatSchema, errorFromWireFormat,
 *
 *   // Result
 *   Result, Ok, Err, isOk, isErr,
 *   map, flatMap, match, collect, partition,
 *   wrapThrowing, wrapThrowingAsync,
 *
 *   // Branded Types
 *   Brand, BrandHelpers, createBrandHelpers,
 *   SafeGitRef, SafeGitRefHelpers,
 *   CanonicalPath, CanonicalPathHelpers,
 *   ValidatedConfig, createValidatedConfigHelpers,
 *
 *   // assertNever
 *   assertNever,
 * } from './types/index.js';
 * ```
 */

// =============================================================================
// Errors
// =============================================================================

export {
  // Wire format
  ErrorWireFormat,
  ErrorWireFormatSchema,
  errorFromWireFormat,

  // Base class
  BaseError,

  // ConfigError
  ConfigError,
  ConfigErrorCode,
  ConfigErrorContext,
  isConfigError,

  // AgentError
  AgentError,
  AgentErrorCode,
  AgentErrorContext,
  isAgentError,

  // NetworkError
  NetworkError,
  NetworkErrorCode,
  NetworkErrorContext,
  isNetworkError,

  // ValidationError
  ValidationError,
  ValidationErrorCode,
  ValidationErrorContext,
  isValidationError,

  // Generic guard
  isBaseError,
} from './errors.js';

// =============================================================================
// Result
// =============================================================================

export {
  // Types
  Result,
  Ok as OkType,
  Err as ErrType,

  // Constructors
  Ok,
  Err,

  // Type guards
  isOk,
  isErr,

  // Utilities
  unwrap,
  unwrapOr,
  unwrapOrElse,
  map,
  mapErr,
  flatMap,
  match,

  // Async utilities
  fromPromise,
  toPromise,
  mapAsync,
  flatMapAsync,

  // Collection utilities
  collect,
  partition,

  // Zod integration
  ResultSchema,

  // Backward compatibility
  wrapThrowing,
  wrapThrowingAsync,
  tryCatch,
  tryCatchAsync,
} from './result.js';

// =============================================================================
// Branded Types
// =============================================================================

export {
  // Generic brand type
  Brand,
  BrandHelpers,
  createBrandHelpers,

  // SafeGitRef
  SafeGitRef,
  SafeGitRefHelpers,

  // CanonicalPath
  CanonicalPath,
  CanonicalPathHelpers,

  // ValidatedConfig
  ValidatedConfig,
  createValidatedConfigHelpers,

  // Zod integration
  brandedSchema,

  // Serialization
  BrandedSerializer,
  createBrandedSerializer,
} from './branded.js';

// =============================================================================
// assertNever
// =============================================================================

export { assertNever } from './assert-never.js';
