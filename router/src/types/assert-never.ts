/**
 * Exhaustive switch utility for discriminated unions
 *
 * Use in the default branch of switch statements to ensure all cases are handled.
 * TypeScript will produce a compile error if any case is missing.
 *
 * @example
 * ```typescript
 * type Status = 'success' | 'failure' | 'skipped';
 *
 * function handle(status: Status): string {
 *   switch (status) {
 *     case 'success':
 *       return 'ok';
 *     case 'failure':
 *       return 'failed';
 *     case 'skipped':
 *       return 'skip';
 *     default:
 *       return assertNever(status); // Compile error if case missing
 *   }
 * }
 * ```
 *
 * @param x - The value that should be of type `never` if all cases are handled
 * @param message - Optional custom error message
 * @throws Error if called at runtime (indicates missing switch case)
 */
export function assertNever(x: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(x)}`);
}
