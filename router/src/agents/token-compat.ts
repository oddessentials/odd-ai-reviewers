/**
 * Token Parameter Compatibility Module
 *
 * Handles OpenAI API token limit parameter compatibility between modern o-series
 * models (which require max_completion_tokens) and legacy models (which use max_tokens).
 *
 * Strategy: Prefer max_completion_tokens, detect compatibility errors via HTTP 400 +
 * message pattern matching, retry exactly once with max_tokens if needed.
 *
 * @module token-compat
 */

import OpenAI from 'openai';

// =============================================================================
// Types (T002)
// =============================================================================

/**
 * Token limit parameter for OpenAI Chat Completions API.
 * Exactly one of these parameters should be present in a request.
 *
 * - max_completion_tokens: Modern parameter (o-series, preferred)
 * - max_tokens: Legacy parameter (fallback for older models)
 */
export type TokenLimitParam = { max_completion_tokens: number } | { max_tokens: number };

// =============================================================================
// Token Limit Builders (T003, T004)
// =============================================================================

/**
 * Build the preferred token limit parameter (max_completion_tokens).
 * This is the modern parameter required by o-series models.
 *
 * @param limit - The maximum number of tokens for the completion
 * @returns TokenLimitParam with max_completion_tokens
 */
export function buildPreferredTokenLimit(limit: number): TokenLimitParam {
  return { max_completion_tokens: limit };
}

/**
 * Build the fallback token limit parameter (max_tokens).
 * This is the legacy parameter for models that don't support max_completion_tokens.
 *
 * @param limit - The maximum number of tokens for the completion
 * @returns TokenLimitParam with max_tokens
 */
export function buildFallbackTokenLimit(limit: number): TokenLimitParam {
  return { max_tokens: limit };
}

// =============================================================================
// Error Handling (T006, T007, T008)
// =============================================================================

/**
 * Safely extract the error message from an unknown error.
 * Handles Error instances, objects with message property, and primitives.
 *
 * @param error - Unknown error value
 * @returns The error message as a string, or empty string if extraction fails
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error !== null && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    return typeof msg === 'string' ? msg : '';
  }
  if (typeof error === 'string') {
    return error;
  }
  return '';
}

/**
 * Determine if an error is a token parameter compatibility error.
 *
 * A compatibility error is identified by:
 * 1. HTTP 400 Bad Request (OpenAI.BadRequestError)
 * 2. Message contains both 'max_tokens' and 'max_completion_tokens'
 * 3. Message contains 'not supported'
 *
 * This detects errors like:
 * "Unsupported parameter: 'max_tokens' is not supported with this model.
 *  Use 'max_completion_tokens' instead."
 *
 * @param error - Unknown error value
 * @returns true if this is a token parameter compatibility error
 */
export function isTokenParamCompatibilityError(error: unknown): boolean {
  // Must be OpenAI BadRequestError (HTTP 400)
  if (!(error instanceof OpenAI.BadRequestError)) {
    return false;
  }

  const msg = extractErrorMessage(error).toLowerCase();

  // Must mention both parameters and "not supported"
  return (
    msg.includes('max_tokens') &&
    msg.includes('max_completion_tokens') &&
    msg.includes('not supported')
  );
}

// =============================================================================
// Compatibility Wrapper (T012, T022-T024)
// =============================================================================

/**
 * Execute an OpenAI API call with token parameter compatibility handling.
 *
 * Strategy:
 * 1. Attempt with modern `max_completion_tokens` parameter (preferred for o-series)
 * 2. If a token parameter compatibility error is detected (HTTP 400 with specific message),
 *    retry exactly once with legacy `max_tokens` parameter
 * 3. Non-compatibility errors are thrown immediately without retry
 *
 * When fallback engages, a warning is logged with the model name (FR-010).
 * No sensitive data (API keys, payloads, token values) is logged (FR-011).
 *
 * @param fn - Function that makes the OpenAI API call, receiving the token limit param
 * @param tokenLimit - The maximum tokens for the completion
 * @param model - Model name (used in fallback warning log)
 * @returns Promise resolving to the API response
 *
 * @example
 * ```typescript
 * const response = await withTokenCompatibility(
 *   (tokenParam) => openai.chat.completions.create({
 *     model,
 *     messages,
 *     ...tokenParam,
 *   }),
 *   4000,
 *   'gpt-4o'
 * );
 * ```
 */
export async function withTokenCompatibility<T>(
  fn: (tokenParam: TokenLimitParam) => Promise<T>,
  tokenLimit: number,
  model: string
): Promise<T> {
  // Attempt 1: Use preferred parameter (max_completion_tokens)
  const preferredParam = buildPreferredTokenLimit(tokenLimit);

  try {
    return await fn(preferredParam);
  } catch (error: unknown) {
    // T022: Check if this is a token parameter compatibility error
    if (!isTokenParamCompatibilityError(error)) {
      // T024: Non-compatibility errors are thrown immediately
      throw error;
    }

    // T043-T044: Log fallback event at warning level (FR-010)
    // Note: Only model name logged, no sensitive data (API keys, payloads, token values) per FR-011
    console.warn(
      `[token-compat] Fallback engaged: model=${model}, retrying with max_tokens (was max_completion_tokens)`
    );

    // T023: Retry exactly once with fallback parameter (max_tokens)
    const fallbackParam = buildFallbackTokenLimit(tokenLimit);
    return fn(fallbackParam);
  }
}
