/**
 * Analysis Decision Logger
 *
 * Provides structured logging for control flow analysis decisions.
 * Implements FR-013: Log analysis decisions for debugging and audit purposes.
 *
 * Log categories:
 * - path: Path traversal decisions
 * - mitigation: Mitigation detection and evaluation
 * - depth: Call depth and recursion limits
 * - finding: Finding generation and suppression
 * - budget: Time/size budget usage
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Log levels for analysis decisions.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Categories of analysis decisions.
 */
export type LogCategory =
  | 'path'
  | 'mitigation'
  | 'depth'
  | 'finding'
  | 'budget'
  | 'cfg'
  | 'vulnerability'
  | 'pattern_timeout'
  | 'cross_file'
  | 'call_chain';

/**
 * Structured log entry for analysis decisions.
 */
export interface AnalysisLogEntry {
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Configuration for the analysis logger.
 */
export interface LoggerConfig {
  /** Minimum log level to record. Default: 'info' */
  minLevel: LogLevel;
  /** Maximum number of log entries to retain. Default: 1000 */
  maxEntries: number;
  /** Whether to also output to console. Default: false */
  consoleOutput: boolean;
  /** Categories to include. If empty, all categories are included. */
  includeCategories: LogCategory[];
  /** Categories to exclude. */
  excludeCategories: LogCategory[];
}

// =============================================================================
// Constants
// =============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: 'info',
  maxEntries: 1000,
  consoleOutput: false,
  includeCategories: [],
  excludeCategories: [],
};

// =============================================================================
// AnalysisLogger Class
// =============================================================================

/**
 * Logger for control flow analysis decisions.
 *
 * Captures structured log entries for debugging and audit purposes.
 * Entries can be retrieved for inclusion in analysis reports.
 */
export class AnalysisLogger {
  private config: LoggerConfig;
  private entries: AnalysisLogEntry[] = [];
  private analysisId: string;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.analysisId = this.generateAnalysisId();
  }

  /**
   * Generate a unique analysis ID for correlation.
   */
  private generateAnalysisId(): string {
    return `cfa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Get the current analysis ID.
   */
  getAnalysisId(): string {
    return this.analysisId;
  }

  /**
   * Start a new analysis session with a fresh ID.
   */
  startNewSession(): void {
    this.analysisId = this.generateAnalysisId();
    this.entries = [];
  }

  /**
   * Check if a log entry should be recorded based on configuration.
   */
  private shouldLog(level: LogLevel, category: LogCategory): boolean {
    // Check level threshold
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.minLevel]) {
      return false;
    }

    // Check category filters
    if (this.config.excludeCategories.includes(category)) {
      return false;
    }

    if (
      this.config.includeCategories.length > 0 &&
      !this.config.includeCategories.includes(category)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Add a log entry.
   */
  private addEntry(
    level: LogLevel,
    category: LogCategory,
    message: string,
    context?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level, category)) {
      return;
    }

    const entry: AnalysisLogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      context,
    };

    this.entries.push(entry);

    // Trim old entries if over limit
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    // Console output if enabled
    if (this.config.consoleOutput) {
      this.outputToConsole(entry);
    }
  }

  /**
   * Output log entry to console.
   */
  private outputToConsole(entry: AnalysisLogEntry): void {
    const prefix = `[CFA:${entry.category}]`;
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    const message = `${prefix} ${entry.message}${contextStr}`;

    switch (entry.level) {
      case 'debug':
        console.debug(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'error':
        console.error(message);
        break;
    }
  }

  // ===========================================================================
  // Path Logging (FR-013: path taken)
  // ===========================================================================

  /**
   * Log path traversal start.
   */
  logPathStart(fromNode: string, toNode: string): void {
    this.addEntry('debug', 'path', `Starting path traversal from ${fromNode} to ${toNode}`, {
      fromNode,
      toNode,
    });
  }

  /**
   * Log path found.
   */
  logPathFound(signature: string, nodeCount: number): void {
    this.addEntry('debug', 'path', `Found path: ${signature} (${nodeCount} nodes)`, {
      signature,
      nodeCount,
    });
  }

  /**
   * Log path analysis complete.
   */
  logPathAnalysisComplete(
    totalPaths: number,
    mitigatedCount: number,
    unmitigatedCount: number
  ): void {
    this.addEntry(
      'info',
      'path',
      `Path analysis complete: ${totalPaths} paths (${mitigatedCount} mitigated, ${unmitigatedCount} unmitigated)`,
      { totalPaths, mitigatedCount, unmitigatedCount }
    );
  }

  /**
   * Log path limit reached.
   */
  logPathLimitReached(limit: number): void {
    this.addEntry('warn', 'path', `Path limit reached (${limit}). Analysis may be incomplete.`, {
      limit,
    });
  }

  /**
   * Log unreachable node detected.
   */
  logUnreachableNode(nodeId: string, reason: string): void {
    this.addEntry('debug', 'path', `Node ${nodeId} is unreachable: ${reason}`, {
      nodeId,
      reason,
    });
  }

  // ===========================================================================
  // Mitigation Logging (FR-013: mitigations evaluated)
  // ===========================================================================

  /**
   * Log mitigation pattern match.
   */
  logMitigationMatch(
    patternId: string,
    location: { line: number },
    vulnerabilityType: string
  ): void {
    this.addEntry(
      'debug',
      'mitigation',
      `Mitigation pattern ${patternId} matched at line ${location.line} for ${vulnerabilityType}`,
      { patternId, location, vulnerabilityType }
    );
  }

  /**
   * Log mitigation evaluation for a path.
   */
  logMitigationEvaluation(
    pathSignature: string,
    mitigations: string[],
    result: 'mitigated' | 'unmitigated'
  ): void {
    this.addEntry(
      'debug',
      'mitigation',
      `Path ${pathSignature}: ${result} (${mitigations.length} mitigations)`,
      { pathSignature, mitigations, result }
    );
  }

  /**
   * Log custom pattern evaluation.
   */
  logCustomPatternEvaluation(patternId: string, matched: boolean): void {
    this.addEntry(
      'debug',
      'mitigation',
      `Custom pattern ${patternId}: ${matched ? 'matched' : 'no match'}`,
      { patternId, matched }
    );
  }

  /**
   * Log mitigation coverage summary.
   */
  logMitigationCoverage(
    vulnerabilityType: string,
    coveragePercent: number,
    status: 'full' | 'partial' | 'none'
  ): void {
    this.addEntry(
      'info',
      'mitigation',
      `${vulnerabilityType}: ${coveragePercent.toFixed(0)}% mitigation coverage (${status})`,
      { vulnerabilityType, coveragePercent, status }
    );
  }

  // ===========================================================================
  // Depth Logging (FR-013: depth reached)
  // ===========================================================================

  /**
   * Log function call depth.
   */
  logCallDepth(functionName: string, currentDepth: number, maxDepth: number): void {
    this.addEntry(
      'debug',
      'depth',
      `Entering ${functionName} at depth ${currentDepth}/${maxDepth}`,
      { functionName, currentDepth, maxDepth }
    );
  }

  /**
   * Log depth limit reached.
   */
  logDepthLimitReached(functionName: string, maxDepth: number): void {
    this.addEntry(
      'warn',
      'depth',
      `Call depth limit (${maxDepth}) reached at ${functionName}. Using conservative analysis.`,
      { functionName, maxDepth }
    );
  }

  /**
   * Log inter-procedural analysis start.
   */
  logInterProceduralStart(callerFunction: string, calleeFunction: string, callSite: number): void {
    this.addEntry(
      'debug',
      'depth',
      `Inter-procedural: ${callerFunction} -> ${calleeFunction} at line ${callSite}`,
      { callerFunction, calleeFunction, callSite }
    );
  }

  // ===========================================================================
  // Finding Logging
  // ===========================================================================

  /**
   * Log finding generation.
   */
  logFindingGenerated(ruleId: string, severity: string, file: string, line: number): void {
    this.addEntry(
      'info',
      'finding',
      `Finding generated: ${ruleId} (${severity}) at ${file}:${line}`,
      { ruleId, severity, file, line }
    );
  }

  /**
   * Log finding suppression due to full mitigation.
   */
  logFindingSuppressed(
    vulnerabilityType: string,
    file: string,
    line: number,
    mitigations: string[]
  ): void {
    this.addEntry(
      'info',
      'finding',
      `Finding suppressed: ${vulnerabilityType} at ${file}:${line} (fully mitigated)`,
      { vulnerabilityType, file, line, mitigations }
    );
  }

  /**
   * Log severity downgrade.
   */
  logSeverityDowngrade(
    originalSeverity: string,
    newSeverity: string,
    coveragePercent: number
  ): void {
    this.addEntry(
      'info',
      'finding',
      `Severity downgraded: ${originalSeverity} -> ${newSeverity} (${coveragePercent.toFixed(0)}% coverage)`,
      { originalSeverity, newSeverity, coveragePercent }
    );
  }

  // ===========================================================================
  // Budget Logging
  // ===========================================================================

  /**
   * Log budget usage.
   */
  logBudgetUsage(type: 'time' | 'size', used: number, total: number): void {
    const percent = ((used / total) * 100).toFixed(1);
    this.addEntry('debug', 'budget', `${type} budget: ${used}/${total} (${percent}%)`, {
      type,
      used,
      total,
      percent,
    });
  }

  /**
   * Log budget warning threshold.
   */
  logBudgetWarning(type: 'time' | 'size', percent: number): void {
    this.addEntry(
      'warn',
      'budget',
      `${type} budget at ${percent.toFixed(0)}%. Analysis may be degraded.`,
      { type, percent }
    );
  }

  /**
   * Log budget exceeded.
   */
  logBudgetExceeded(type: 'time' | 'size'): void {
    this.addEntry('error', 'budget', `${type} budget exceeded. Analysis stopped gracefully.`, {
      type,
    });
  }

  // ===========================================================================
  // CFG Logging
  // ===========================================================================

  /**
   * Log CFG construction.
   */
  logCFGBuilt(functionName: string, nodeCount: number, edgeCount: number): void {
    this.addEntry(
      'debug',
      'cfg',
      `CFG built for ${functionName}: ${nodeCount} nodes, ${edgeCount} edges`,
      { functionName, nodeCount, edgeCount }
    );
  }

  /**
   * Log CFG complexity warning.
   */
  logCFGComplexity(functionName: string, nodeCount: number): void {
    this.addEntry('warn', 'cfg', `High complexity CFG for ${functionName}: ${nodeCount} nodes`, {
      functionName,
      nodeCount,
    });
  }

  // ===========================================================================
  // Pattern Timeout Logging (FR-003, FR-012)
  // ===========================================================================

  /**
   * Log pattern evaluation timeout.
   */
  logPatternTimeout(patternId: string, inputLength: number, elapsedMs: number): void {
    this.addEntry(
      'warn',
      'pattern_timeout',
      `Pattern ${patternId} timed out after ${elapsedMs.toFixed(1)}ms (input: ${inputLength} chars)`,
      { patternId, inputLength, elapsedMs, result: 'conservative_non_match' }
    );
  }

  /**
   * Log pattern evaluation completion (for debugging).
   */
  logPatternEvaluated(
    patternId: string,
    matched: boolean,
    elapsedMs: number,
    inputLength: number
  ): void {
    this.addEntry(
      'debug',
      'pattern_timeout',
      `Pattern ${patternId}: ${matched ? 'matched' : 'no match'} in ${elapsedMs.toFixed(2)}ms`,
      { patternId, matched, elapsedMs, inputLength }
    );
  }

  // ===========================================================================
  // Cross-File Mitigation Logging (FR-011)
  // ===========================================================================

  /**
   * Log cross-file mitigation detection.
   */
  logCrossFileMitigation(
    vulnerabilityFile: string,
    mitigationFile: string,
    mitigationLine: number,
    depth: number,
    patternId: string
  ): void {
    this.addEntry(
      'info',
      'cross_file',
      `Cross-file mitigation: ${patternId} at ${mitigationFile}:${mitigationLine} (depth: ${depth})`,
      { vulnerabilityFile, mitigationFile, mitigationLine, depth, patternId }
    );
  }

  // ===========================================================================
  // Call Chain Logging (FR-011 verbose)
  // ===========================================================================

  /**
   * Log call chain traversal (verbose mode).
   */
  logCallChainStep(
    fromFile: string,
    fromFunction: string,
    toFile: string,
    toFunction: string,
    depth: number
  ): void {
    this.addEntry(
      'debug',
      'call_chain',
      `Call chain: ${fromFunction} (${fromFile}) -> ${toFunction} (${toFile}) at depth ${depth}`,
      { fromFile, fromFunction, toFile, toFunction, depth }
    );
  }

  /**
   * Log complete call chain for a mitigation.
   */
  logCallChainComplete(
    patternId: string,
    chain: { file: string; functionName: string; line: number }[]
  ): void {
    const chainStr = chain.map((c) => `${c.functionName}@${c.file}:${c.line}`).join(' -> ');
    this.addEntry('debug', 'call_chain', `Complete call chain for ${patternId}: ${chainStr}`, {
      patternId,
      chain,
      totalDepth: chain.length - 1,
    });
  }

  // ===========================================================================
  // Log Retrieval
  // ===========================================================================

  /**
   * Get all log entries.
   */
  getEntries(): AnalysisLogEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries filtered by category.
   */
  getEntriesByCategory(category: LogCategory): AnalysisLogEntry[] {
    return this.entries.filter((e) => e.category === category);
  }

  /**
   * Get entries filtered by level.
   */
  getEntriesByLevel(level: LogLevel): AnalysisLogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }

  /**
   * Get a summary of the analysis session.
   */
  getSummary(): {
    analysisId: string;
    totalEntries: number;
    byLevel: Record<LogLevel, number>;
    byCategory: Record<LogCategory, number>;
    warnings: number;
    errors: number;
  } {
    const byLevel: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    const byCategory: Record<LogCategory, number> = {
      path: 0,
      mitigation: 0,
      depth: 0,
      finding: 0,
      budget: 0,
      cfg: 0,
      vulnerability: 0,
      pattern_timeout: 0,
      cross_file: 0,
      call_chain: 0,
    };

    for (const entry of this.entries) {
      byLevel[entry.level]++;
      byCategory[entry.category]++;
    }

    return {
      analysisId: this.analysisId,
      totalEntries: this.entries.length,
      byLevel,
      byCategory,
      warnings: byLevel.warn,
      errors: byLevel.error,
    };
  }

  // ===========================================================================
  // Generic Logging
  // ===========================================================================

  /**
   * Generic log method for arbitrary categories.
   */
  log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    context?: Record<string, unknown>
  ): void {
    this.addEntry(level, category, message, context);
  }

  /**
   * Clear all log entries.
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Export log entries as JSON string.
   */
  exportAsJson(): string {
    return JSON.stringify({
      analysisId: this.analysisId,
      exportTime: Date.now(),
      entries: this.entries,
    });
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let defaultLogger: AnalysisLogger | null = null;

/**
 * Get the default logger instance.
 */
export function getLogger(): AnalysisLogger {
  if (!defaultLogger) {
    defaultLogger = new AnalysisLogger();
  }
  return defaultLogger;
}

/**
 * Create a new logger with custom configuration.
 */
export function createLogger(config?: Partial<LoggerConfig>): AnalysisLogger {
  return new AnalysisLogger(config);
}

/**
 * Reset the default logger (for testing).
 */
export function resetLogger(): void {
  defaultLogger = null;
}
