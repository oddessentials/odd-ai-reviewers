/**
 * Phases Module
 *
 * Export all phase functions for orchestration from main.ts.
 */

export { runPreflightChecks, type PreflightResult } from './preflight.js';
export {
  executeAllPasses,
  type ExecuteOptions,
  type ExecuteResult,
  type SkippedAgent,
} from './execute.js';
export {
  processFindings,
  dispatchReport,
  checkGating,
  type Platform,
  type ReportOptions,
  type ProcessedFindings,
  type DispatchReportResult,
} from './report.js';
