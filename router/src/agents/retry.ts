import OpenAI from 'openai';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

/**
 * Determine retry delay for an error, or null if non-retryable.
 * - 429 Rate Limit: retry with Retry-After header or longer backoff
 * - 5xx/timeout: retryable with exponential backoff
 * - 4xx (except 429): non-retryable
 */
export function getRetryDelayMs(error: unknown, attempt: number): number | null {
  if (error instanceof OpenAI.RateLimitError) {
    // OpenAI 6 uses native Headers object with .get() method
    const headers = (error as { headers?: Headers | Record<string, string> }).headers;
    const retryAfter =
      headers instanceof Headers ? headers.get('retry-after') : headers?.['retry-after'];
    if (retryAfter) {
      return parseInt(retryAfter, 10) * 1000;
    }
    return BASE_DELAY_MS * Math.pow(2, attempt + 2);
  }

  if (error instanceof OpenAI.InternalServerError) {
    return BASE_DELAY_MS * Math.pow(2, attempt);
  }

  if (error instanceof OpenAI.APIConnectionError) {
    return BASE_DELAY_MS * Math.pow(2, attempt);
  }

  if (error instanceof OpenAI.APIError) {
    const status = (error as { status?: number }).status;
    if (status && status >= 500) {
      return BASE_DELAY_MS * Math.pow(2, attempt);
    }
  }

  if (error instanceof OpenAI.AuthenticationError) return null;
  if (error instanceof OpenAI.BadRequestError) return null;
  if (error instanceof OpenAI.NotFoundError) return null;
  if (error instanceof OpenAI.PermissionDeniedError) return null;

  return null;
}

/**
 * Execute a function with exponential backoff retries.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const delayMs = getRetryDelayMs(error, attempt);
      const isLastAttempt = attempt === MAX_RETRIES - 1;

      if (delayMs === null || isLastAttempt) {
        throw error;
      }

      console.log(
        `[retry] Attempt ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Retry exhausted');
}
