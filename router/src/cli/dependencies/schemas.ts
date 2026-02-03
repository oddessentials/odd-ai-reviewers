/**
 * Zod schemas for runtime validation of dependency check results.
 * @module cli/dependencies/schemas
 */

import { z } from 'zod';

/**
 * Schema for supported platforms.
 */
export const PlatformSchema = z.enum(['darwin', 'win32', 'linux']);

/**
 * Schema for dependency check status.
 */
export const DependencyStatusSchema = z.enum([
  'available',
  'missing',
  'unhealthy',
  'version-mismatch',
]);

/**
 * Schema for a single dependency check result.
 */
export const DependencyCheckResultSchema = z.object({
  name: z.string(),
  status: DependencyStatusSchema,
  version: z.string().nullable(),
  error: z.string().nullable(),
});

/**
 * Schema for aggregated dependency check summary.
 */
export const DependencyCheckSummarySchema = z.object({
  results: z.array(DependencyCheckResultSchema),
  missingRequired: z.array(z.string()),
  missingOptional: z.array(z.string()),
  unhealthy: z.array(z.string()),
  versionWarnings: z.array(z.string()),
  hasBlockingIssues: z.boolean(),
  hasWarnings: z.boolean(),
});

// Inferred types from schemas (for type-safe usage)
export type PlatformFromSchema = z.infer<typeof PlatformSchema>;
export type DependencyStatusFromSchema = z.infer<typeof DependencyStatusSchema>;
export type DependencyCheckResultFromSchema = z.infer<typeof DependencyCheckResultSchema>;
export type DependencyCheckSummaryFromSchema = z.infer<typeof DependencyCheckSummarySchema>;
