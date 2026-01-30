/**
 * Analysis Budget Management
 *
 * Tracks time and size limits during control flow analysis.
 * Implements FR-018 (time budget), FR-019 (size budget), FR-020 (degraded mode),
 * and FR-021 (graceful termination).
 *
 * Tasks: T061-T066
 */

import type { BudgetStatus, AnalysisLogEntry } from './types.js';
import { getLogger, type AnalysisLogger } from './logger.js';

/**
 * Configuration for analysis budget limits
 */
export interface BudgetConfig {
  /** Maximum analysis duration in milliseconds (default: 300,000 = 5 min) */
  maxDurationMs: number;
  /** Maximum lines to analyze (default: 10,000) */
  maxLinesChanged: number;
  /** Maximum call depth for inter-procedural analysis (default: 5) */
  maxCallDepth: number;
  /** Maximum nodes to visit per traversal (default: 10,000) */
  maxNodesVisited: number;
}

/**
 * Default budget configuration per FR-018, FR-019, FR-003
 */
export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  maxDurationMs: 300_000, // 5 minutes
  maxLinesChanged: 10_000,
  maxCallDepth: 5,
  maxNodesVisited: 10_000,
};

/**
 * File priority levels for degraded mode filtering.
 */
export type FilePriority = 'high' | 'medium' | 'low';

/**
 * Patterns for determining file priority.
 * High priority: security-sensitive files (always analyze)
 * Medium priority: business logic (analyze if budget allows)
 * Low priority: tests, config (skip in degraded mode)
 */
export const FILE_PRIORITY_PATTERNS: Record<FilePriority, RegExp[]> = {
  high: [
    /[/\\](auth|security|middleware)[/\\]/,
    /[/\\](handlers|controllers)[/\\]/,
    /[/\\]api[/\\]/,
    /[/\\](database|db)[/\\]/,
    /sanitize|validate|escape/i,
  ],
  medium: [/[/\\](services|utils)[/\\]/, /[/\\](models|entities)[/\\]/, /[/\\](helpers|lib)[/\\]/],
  low: [
    /[/\\]__tests__[/\\]/,
    /\.test\./,
    /\.spec\./,
    /^(scripts|tools)[/\\]/,
    /[/\\](scripts|tools)[/\\]/,
    /[/\\](types|interfaces)[/\\]/,
    /[/\\](constants|config)[/\\]/,
  ],
};

/**
 * Determine the priority of a file based on its path.
 */
export function getFilePriority(filePath: string): FilePriority {
  // Check low priority first (tests should always be low)
  for (const pattern of FILE_PRIORITY_PATTERNS.low) {
    if (pattern.test(filePath)) {
      return 'low';
    }
  }

  // Check high priority
  for (const pattern of FILE_PRIORITY_PATTERNS.high) {
    if (pattern.test(filePath)) {
      return 'high';
    }
  }

  // Check medium priority
  for (const pattern of FILE_PRIORITY_PATTERNS.medium) {
    if (pattern.test(filePath)) {
      return 'medium';
    }
  }

  // Default to medium
  return 'medium';
}

/**
 * Analysis Budget Manager
 *
 * Tracks resource consumption and triggers degraded mode when limits approach.
 * Ensures deterministic behavior: same input always produces same degradation.
 */
export class AnalysisBudget {
  private readonly startTime: number;
  private readonly config: BudgetConfig;
  private linesAnalyzed = 0;
  private filesAnalyzed = 0;
  private filesSkipped = 0;
  private currentDepth = 0;
  private _status: BudgetStatus = 'ok';
  private degradedAt: number | null = null;
  private readonly log: AnalysisLogEntry[] = [];
  private readonly logger: AnalysisLogger;

  constructor(config: Partial<BudgetConfig> = {}, logger?: AnalysisLogger) {
    this.startTime = Date.now();
    this.config = { ...DEFAULT_BUDGET_CONFIG, ...config };
    this.logger = logger ?? getLogger();
  }

  /**
   * Get current budget status
   */
  get status(): BudgetStatus {
    return this._status;
  }

  /**
   * Check if analysis is in degraded mode
   */
  get isDegraded(): boolean {
    return (
      this._status === 'warning' || this._status === 'exceeded' || this._status === 'terminated'
    );
  }

  /**
   * Get effective max call depth (reduced in degraded mode)
   */
  get effectiveMaxCallDepth(): number {
    // Per FR-020: reduce call depth to 3 in degraded mode
    return this.isDegraded ? Math.min(3, this.config.maxCallDepth) : this.config.maxCallDepth;
  }

  /**
   * Get elapsed time in milliseconds
   */
  get elapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get time remaining before budget exceeded
   */
  get remainingMs(): number {
    return Math.max(0, this.config.maxDurationMs - this.elapsedMs);
  }

  /**
   * Get percentage of time budget consumed
   */
  get timePercentUsed(): number {
    return (this.elapsedMs / this.config.maxDurationMs) * 100;
  }

  /**
   * Get percentage of size budget consumed
   */
  get sizePercentUsed(): number {
    return (this.linesAnalyzed / this.config.maxLinesChanged) * 100;
  }

  /**
   * Get analysis statistics
   */
  get stats(): {
    linesAnalyzed: number;
    filesAnalyzed: number;
    filesSkipped: number;
    elapsedMs: number;
    status: BudgetStatus;
    degraded: boolean;
    timePercentUsed: number;
    sizePercentUsed: number;
  } {
    return {
      linesAnalyzed: this.linesAnalyzed,
      filesAnalyzed: this.filesAnalyzed,
      filesSkipped: this.filesSkipped,
      elapsedMs: this.elapsedMs,
      status: this._status,
      degraded: this.isDegraded,
      timePercentUsed: this.timePercentUsed,
      sizePercentUsed: this.sizePercentUsed,
    };
  }

  /**
   * Check if a file should be analyzed based on priority and budget status.
   * Per FR-020: Skip low-priority files in degraded mode.
   */
  shouldAnalyzeFile(filePath: string): boolean {
    // Always check budget first
    this.checkBudget();

    // If terminated, don't analyze anything
    if (this._status === 'terminated') {
      this.filesSkipped++;
      this.logger.logBudgetExceeded('size');
      return false;
    }

    // If not degraded, analyze everything
    if (!this.isDegraded) {
      return true;
    }

    // In degraded mode, skip low priority files
    const priority = getFilePriority(filePath);
    if (priority === 'low') {
      this.filesSkipped++;
      this.addLog('info', `Skipping low-priority file in degraded mode: ${filePath}`, {
        priority,
        status: this._status,
      });
      return false;
    }

    return true;
  }

  /**
   * Sort files by priority for analysis order.
   * High priority files are analyzed first.
   */
  sortFilesByPriority<T extends { path: string }>(files: T[]): T[] {
    const priorityOrder: Record<FilePriority, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };

    return [...files].sort((a, b) => {
      const priorityA = priorityOrder[getFilePriority(a.path)];
      const priorityB = priorityOrder[getFilePriority(b.path)];
      return priorityA - priorityB;
    });
  }

  /**
   * Get the analysis log
   */
  get analysisLog(): AnalysisLogEntry[] {
    return [...this.log];
  }

  /**
   * Record analysis of a file
   */
  recordFile(lineCount: number, _filePath?: string): void {
    this.linesAnalyzed += lineCount;
    this.filesAnalyzed++;

    // Log budget usage periodically (every 10 files)
    if (this.filesAnalyzed % 10 === 0) {
      this.logger.logBudgetUsage('size', this.linesAnalyzed, this.config.maxLinesChanged);
      this.logger.logBudgetUsage('time', this.elapsedMs, this.config.maxDurationMs);
    }

    this.checkBudget();
  }

  /**
   * Set current call depth for inter-procedural analysis
   */
  setCallDepth(depth: number): void {
    this.currentDepth = depth;
  }

  /**
   * Check if we can go deeper in call analysis
   */
  canGoDeeper(): boolean {
    return this.currentDepth < this.effectiveMaxCallDepth && this._status !== 'terminated';
  }

  /**
   * Check budget status and update if needed
   * Returns the current status after check
   */
  checkBudget(): BudgetStatus {
    if (this._status === 'terminated') {
      return this._status;
    }

    const timePercent = this.timePercentUsed;
    const sizePercent = this.sizePercentUsed;

    // Check for termination (100% of either budget)
    if (timePercent >= 100 || sizePercent >= 100) {
      this.transitionTo('terminated');
      return this._status;
    }

    // Check for exceeded (approaching limit)
    if (timePercent >= 90 || sizePercent >= 90) {
      if (this._status !== 'exceeded') {
        this.transitionTo('exceeded');
      }
      return this._status;
    }

    // Check for warning (80% threshold per FR-020)
    if (timePercent >= 80 || sizePercent >= 80) {
      if (this._status === 'ok') {
        this.transitionTo('warning');
      }
      return this._status;
    }

    return this._status;
  }

  /**
   * Transition to a new budget status
   */
  private transitionTo(newStatus: BudgetStatus): void {
    const oldStatus = this._status;
    this._status = newStatus;

    if (newStatus === 'warning' || newStatus === 'exceeded') {
      if (this.degradedAt === null) {
        this.degradedAt = Date.now();
      }
      // Log budget warning
      const budgetType = this.timePercentUsed >= this.sizePercentUsed ? 'time' : 'size';
      const percent = Math.max(this.timePercentUsed, this.sizePercentUsed);
      this.logger.logBudgetWarning(budgetType, percent);
    }

    if (newStatus === 'terminated') {
      const budgetType = this.timePercentUsed >= 100 ? 'time' : 'size';
      this.logger.logBudgetExceeded(budgetType);
    }

    this.addLog('info', `Budget status changed: ${oldStatus} -> ${newStatus}`, {
      timePercent: this.timePercentUsed.toFixed(1),
      sizePercent: this.sizePercentUsed.toFixed(1),
      effectiveCallDepth: this.effectiveMaxCallDepth,
    });
  }

  /**
   * Add an entry to the analysis log
   */
  addLog(
    level: AnalysisLogEntry['level'],
    message: string,
    context?: Record<string, unknown>
  ): void {
    this.log.push({
      timestamp: Date.now(),
      level,
      message,
      context,
    });
  }

  /**
   * Check if analysis should continue
   * Returns false if budget is terminated
   */
  shouldContinue(): boolean {
    this.checkBudget();
    return this._status !== 'terminated';
  }

  /**
   * Get reason for degradation (if degraded)
   */
  getDegradedReason(): string | undefined {
    if (!this.isDegraded && this._status !== 'terminated') {
      return undefined;
    }

    const reasons: string[] = [];

    if (this.timePercentUsed >= 80) {
      reasons.push(`time budget ${this.timePercentUsed.toFixed(0)}% consumed`);
    }

    if (this.sizePercentUsed >= 80) {
      reasons.push(`size budget ${this.sizePercentUsed.toFixed(0)}% consumed`);
    }

    if (reasons.length === 0) {
      return 'budget limits approached';
    }

    return reasons.join(', ');
  }

  /**
   * Create a snapshot of current budget state for finding metadata
   */
  toFindingMetadata(): {
    analysisDepth: number;
    degraded: boolean;
    degradedReason?: string;
  } {
    return {
      analysisDepth: this.currentDepth,
      degraded: this.isDegraded,
      degradedReason: this.getDegradedReason(),
    };
  }
}
