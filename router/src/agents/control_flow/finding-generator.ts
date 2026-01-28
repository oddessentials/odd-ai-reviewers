/**
 * Finding Generator
 *
 * Generates findings with mitigation-aware severity adjustment and reasoning.
 *
 * Implements:
 * - T030: Finding suppression when full mitigation coverage proven
 * - FR-008: Explain mitigation reasoning in findings
 * - FR-009: Severity downgrade for partial mitigation (Critical→High→Medium→Low)
 * - FR-010: Partial mitigation message template
 */

import type {
  ControlFlowFinding,
  FindingMetadata,
  Severity,
  VulnerabilityType,
  PotentialVulnerability,
  ControlFlowConfig,
  PatternTimeoutInfo,
  CrossFileMitigationInfo,
} from './types.js';
import type { ControlFlowGraphRuntime } from './cfg-types.js';
import { type PathAnalysisResult, type PathAnalyzer, createPathAnalyzer } from './path-analyzer.js';
import { createHash } from 'crypto';

// =============================================================================
// Types
// =============================================================================

/**
 * Maps vulnerability types to their base severity.
 */
const VULNERABILITY_BASE_SEVERITY: Record<VulnerabilityType, Severity> = {
  injection: 'error',
  null_deref: 'warning',
  auth_bypass: 'error',
  xss: 'error',
  path_traversal: 'error',
  prototype_pollution: 'error',
  ssrf: 'error',
};

/**
 * Severity downgrade order per FR-009.
 */
const SEVERITY_ORDER: Severity[] = ['error', 'warning', 'info'];

/**
 * Rule ID prefix for control flow findings.
 */
const RULE_PREFIX = 'cfa/';

/**
 * Coverage thresholds for severity downgrade (FR-009).
 */
const HIGH_COVERAGE_THRESHOLD = 75; // >= 75% coverage: downgrade by 2 levels
const MEDIUM_COVERAGE_THRESHOLD = 50; // >= 50% coverage: downgrade by 1 level

// =============================================================================
// Finding Generator Class
// =============================================================================

/**
 * Generates control flow analysis findings with mitigation awareness.
 *
 * The generator suppresses findings when all paths are mitigated,
 * and downgrades severity for partial mitigations.
 */
export class FindingGenerator {
  private config: ControlFlowConfig;
  private pathAnalyzer: PathAnalyzer;
  private patternTimeouts: PatternTimeoutInfo[] = [];
  private crossFileMitigations: CrossFileMitigationInfo[] = [];

  constructor(config?: Partial<ControlFlowConfig>) {
    this.config = {
      enabled: true,
      maxCallDepth: config?.maxCallDepth ?? 5,
      timeBudgetMs: config?.timeBudgetMs ?? 300_000,
      sizeBudgetLines: config?.sizeBudgetLines ?? 10_000,
      mitigationPatterns: config?.mitigationPatterns ?? [],
      patternOverrides: config?.patternOverrides ?? [],
      disabledPatterns: config?.disabledPatterns ?? [],
      patternTimeoutMs: config?.patternTimeoutMs ?? 100,
    };
    this.pathAnalyzer = createPathAnalyzer(config);
  }

  /**
   * Set pattern timeouts to include in finding metadata.
   */
  setPatternTimeouts(timeouts: PatternTimeoutInfo[]): void {
    this.patternTimeouts = timeouts;
  }

  /**
   * Set cross-file mitigations to include in finding messages and metadata.
   */
  setCrossFileMitigations(mitigations: CrossFileMitigationInfo[]): void {
    this.crossFileMitigations = mitigations;
  }

  /**
   * Clear collected stats for a new analysis session.
   */
  clearStats(): void {
    this.patternTimeouts = [];
    this.crossFileMitigations = [];
    this.pathAnalyzer.clearCrossFileMitigations();
  }

  /**
   * Get the internal path analyzer.
   * Use this to run inter-procedural analysis which collects cross-file mitigations.
   */
  getPathAnalyzer(): PathAnalyzer {
    return this.pathAnalyzer;
  }

  /**
   * Sync cross-file mitigations from the path analyzer.
   * Call this after inter-procedural analysis has been performed on the path analyzer.
   */
  syncCrossFileMitigationsFromPathAnalyzer(): void {
    const crossFileMitigations = this.pathAnalyzer.getCrossFileMitigations();
    if (crossFileMitigations.length > 0) {
      this.crossFileMitigations.push(...crossFileMitigations);
      this.pathAnalyzer.clearCrossFileMitigations();
    }
  }

  /**
   * Generate a finding for a potential vulnerability based on path analysis.
   *
   * Returns null if the vulnerability is fully mitigated (suppressed).
   */
  generateFinding(
    vulnerability: PotentialVulnerability,
    cfg: ControlFlowGraphRuntime,
    pathAnalysis: PathAnalysisResult
  ): ControlFlowFinding | null {
    // FR-007: Full mitigation -> suppress finding
    if (pathAnalysis.status === 'full') {
      return null;
    }

    // Determine severity with mitigation-based downgrade
    const baseSeverity = VULNERABILITY_BASE_SEVERITY[vulnerability.type];
    const adjustedSeverity = this.adjustSeverity(baseSeverity, pathAnalysis);

    // Generate message with reasoning
    const message = this.generateMessage(vulnerability, pathAnalysis);
    const suggestion = this.generateSuggestion(vulnerability, pathAnalysis);

    // Generate stable fingerprint
    const fingerprint = this.generateFingerprint(vulnerability, cfg);

    // Build metadata
    const metadata: FindingMetadata = {
      mitigationStatus: pathAnalysis.status,
      originalSeverity: baseSeverity !== adjustedSeverity ? baseSeverity : undefined,
      pathsCovered: pathAnalysis.mitigatedPaths.length,
      pathsTotal: pathAnalysis.pathsToSink.length,
      unprotectedPaths: pathAnalysis.unmitigatedPaths.map((p) => p.signature),
      mitigationsDetected: this.extractMitigationIds(pathAnalysis),
      analysisDepth: this.config.maxCallDepth,
      degraded: pathAnalysis.degraded,
      degradedReason: pathAnalysis.degradedReason,
      // Include pattern timeout info if any timeouts occurred (FR-004)
      patternTimeouts: this.patternTimeouts.length > 0 ? this.patternTimeouts : undefined,
      // Include cross-file mitigation info if any detected (FR-006 to FR-010)
      crossFileMitigations:
        this.crossFileMitigations.length > 0 ? this.crossFileMitigations : undefined,
    };

    return {
      severity: adjustedSeverity,
      file: cfg.filePath,
      line: vulnerability.sinkLocation.line,
      endLine: vulnerability.sinkLocation.endLine,
      message,
      suggestion,
      ruleId: `${RULE_PREFIX}${vulnerability.type}`,
      sourceAgent: 'control_flow',
      fingerprint,
      metadata,
    };
  }

  /**
   * Adjust severity based on mitigation coverage (FR-009).
   *
   * Partial mitigation downgrades severity by one level.
   */
  private adjustSeverity(baseSeverity: Severity, pathAnalysis: PathAnalysisResult): Severity {
    if (pathAnalysis.status !== 'partial') {
      return baseSeverity;
    }

    // Downgrade by coverage percentage
    const coverage = pathAnalysis.coveragePercent;

    if (coverage >= HIGH_COVERAGE_THRESHOLD) {
      // High coverage: downgrade by 2 levels
      return this.downgradeSeverity(baseSeverity, 2);
    } else if (coverage >= MEDIUM_COVERAGE_THRESHOLD) {
      // Medium coverage: downgrade by 1 level
      return this.downgradeSeverity(baseSeverity, 1);
    }

    // Low coverage: no downgrade
    return baseSeverity;
  }

  /**
   * Downgrade severity by n levels.
   */
  private downgradeSeverity(severity: Severity, levels: number): Severity {
    const currentIndex = SEVERITY_ORDER.indexOf(severity);
    const newIndex = Math.min(currentIndex + levels, SEVERITY_ORDER.length - 1);
    return SEVERITY_ORDER[newIndex] ?? severity;
  }

  /**
   * Generate finding message with reasoning (FR-008, FR-010).
   */
  private generateMessage(
    vulnerability: PotentialVulnerability,
    pathAnalysis: PathAnalysisResult
  ): string {
    const baseMessage = vulnerability.description;
    let message: string;

    if (pathAnalysis.status === 'none') {
      message = `${baseMessage}. No mitigations detected on any execution path.`;
    } else if (pathAnalysis.status === 'partial') {
      const { coveragePercent, mitigatedPaths, unmitigatedPaths } = pathAnalysis;
      message =
        `${baseMessage}. Partial mitigation detected: ` +
        `${mitigatedPaths.length} of ${pathAnalysis.pathsToSink.length} paths ` +
        `(${coveragePercent.toFixed(0)}%) are protected. ` +
        `${unmitigatedPaths.length} path(s) remain unprotected.`;

      // Add cross-file mitigation details (FR-006 to FR-010)
      if (this.crossFileMitigations.length > 0) {
        message += this.formatCrossFileMitigations();
      }
    } else {
      message = baseMessage;
    }

    // Add timeout warning if patterns timed out (FR-004)
    if (this.patternTimeouts.length > 0) {
      message += ` Note: ${this.patternTimeouts.length} pattern(s) timed out during evaluation; results may be conservative.`;
    }

    return message;
  }

  /**
   * Format cross-file mitigations for inclusion in finding message.
   */
  private formatCrossFileMitigations(): string {
    if (this.crossFileMitigations.length === 0) return '';

    const lines = this.crossFileMitigations.map((m) => {
      const funcName = m.functionName ? `${m.functionName}()` : 'mitigation';
      return `\n- Protected by: ${funcName} in ${m.file}:${m.line} (depth: ${m.depth})`;
    });

    return lines.join('');
  }

  /**
   * Generate suggestion for fixing the vulnerability.
   */
  private generateSuggestion(
    vulnerability: PotentialVulnerability,
    pathAnalysis: PathAnalysisResult
  ): string {
    if (pathAnalysis.status === 'partial') {
      return `Add mitigation to the following unprotected paths: ${pathAnalysis.unmitigatedPaths
        .map((p) => p.signature)
        .slice(0, 3)
        .join(', ')}${pathAnalysis.unmitigatedPaths.length > 3 ? '...' : ''}`;
    }

    // Generic suggestions by vulnerability type
    const suggestions: Record<VulnerabilityType, string> = {
      injection:
        'Use parameterized queries or validate/sanitize input with a library like Zod or Joi.',
      null_deref: 'Add null/undefined checks or use optional chaining (?.) before accessing.',
      auth_bypass: 'Ensure authentication/authorization checks are performed on all code paths.',
      xss: 'Sanitize output with DOMPurify or use textContent instead of innerHTML.',
      path_traversal:
        'Validate and sanitize file paths. Use path.basename() or whitelist allowed paths.',
      prototype_pollution:
        'Validate object keys and avoid using user input directly as property names.',
      ssrf: 'Validate and whitelist allowed URLs/hosts before making requests.',
    };

    return suggestions[vulnerability.type];
  }

  /**
   * Generate a stable fingerprint for deduplication.
   *
   * Based on research.md algorithm: hash of (file, function, vuln_type, sink_location).
   */
  private generateFingerprint(
    vulnerability: PotentialVulnerability,
    cfg: ControlFlowGraphRuntime
  ): string {
    const components = [
      cfg.filePath,
      cfg.functionName,
      vulnerability.type,
      vulnerability.sinkLocation.line.toString(),
      vulnerability.affectedVariable,
    ];

    return createHash('sha256').update(components.join(':')).digest('hex').slice(0, 16);
  }

  /**
   * Extract unique mitigation IDs from path analysis.
   */
  private extractMitigationIds(pathAnalysis: PathAnalysisResult): string[] {
    const ids = new Set<string>();
    for (const path of pathAnalysis.mitigatedPaths) {
      for (const mitigation of path.mitigations) {
        ids.add(mitigation.patternId);
      }
    }
    return Array.from(ids);
  }

  /**
   * Process multiple vulnerabilities and generate findings.
   *
   * Performs path analysis for each vulnerability and filters out:
   * - Fully mitigated vulnerabilities
   * - Unreachable sinks (T041)
   *
   * @param vulnerabilities List of potential vulnerabilities to analyze
   * @param cfg The control flow graph for the function
   * @param cfgMap Optional map of all CFGs for inter-procedural analysis
   */
  processVulnerabilities(
    vulnerabilities: PotentialVulnerability[],
    cfg: ControlFlowGraphRuntime,
    cfgMap?: Map<string, ControlFlowGraphRuntime>
  ): ControlFlowFinding[] {
    const findings: ControlFlowFinding[] = [];

    // If cfgMap provided, run inter-procedural analysis first to collect cross-file mitigations
    if (cfgMap && cfgMap.size > 0) {
      this.pathAnalyzer.clearCrossFileMitigations();
      this.pathAnalyzer.analyzeInterProcedural(cfg, cfgMap);
      this.syncCrossFileMitigationsFromPathAnalyzer();
    }

    for (const vuln of vulnerabilities) {
      // Find the node containing the sink
      const sinkNode = this.findNodeAtLocation(cfg, vuln.sinkLocation.line);
      if (!sinkNode) continue;

      // T041: Skip unreachable sinks - they can never be executed
      if (!this.pathAnalyzer.isReachable(cfg, sinkNode.id)) {
        continue;
      }

      // Perform path analysis
      const pathAnalysis = this.pathAnalyzer.analyzePathsToSink(cfg, sinkNode.id, vuln.type);

      // Apply conservative fallback if analysis was degraded
      const adjustedAnalysis = this.pathAnalyzer.applyConservativeFallback(pathAnalysis);

      // Generate finding (may be null if fully mitigated)
      const finding = this.generateFinding(vuln, cfg, adjustedAnalysis);
      if (finding) {
        findings.push(finding);
      }
    }

    return findings;
  }

  /**
   * Find the CFG node at a given line number.
   */
  private findNodeAtLocation(cfg: ControlFlowGraphRuntime, line: number): { id: string } | null {
    for (const [id, node] of cfg.nodes) {
      if (node.lineStart <= line && line <= node.lineEnd) {
        return { id };
      }
    }
    return null;
  }
}

// =============================================================================
// Factory function
// =============================================================================

/**
 * Create a finding generator with the given configuration.
 */
export function createFindingGenerator(config?: Partial<ControlFlowConfig>): FindingGenerator {
  return new FindingGenerator(config);
}
