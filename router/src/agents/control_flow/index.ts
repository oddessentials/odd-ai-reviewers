/**
 * Control Flow Analysis Agent
 *
 * Implements flow-sensitive static analysis with mitigation recognition.
 * Addresses enterprise customer feedback about static analysis limitations.
 */

import type { DiffFile } from '../../diff.js';
import type { ReviewAgent, AgentContext, AgentResult, Finding } from '../types.js';
import { AnalysisBudget } from './budget.js';
import { parseSourceFile, findFunctions, buildCFG } from './cfg-builder.js';
import type { ControlFlowConfig } from './types.js';
import { ControlFlowConfigSchema } from './types.js';
import { createMitigationDetector, type MitigationDetector } from './mitigation-detector.js';

/**
 * Supported file extensions for control flow analysis
 */
const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Control Flow Analysis Agent
 *
 * Provides:
 * - Control flow graph construction for TypeScript/JavaScript
 * - Mitigation pattern recognition
 * - Path-aware finding generation
 * - Graceful degradation under resource pressure
 */
export const controlFlowAgent: ReviewAgent = {
  id: 'control_flow',
  name: 'Control Flow Analysis',
  usesLlm: false,

  supports(file: DiffFile): boolean {
    const ext = getFileExtension(file.path);
    return SUPPORTED_EXTENSIONS.includes(ext);
  },

  async run(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];
    let filesProcessed = 0;
    const functionsAnalyzed = 0;

    try {
      // Parse control_flow config from main config
      const cfConfig = parseControlFlowConfig(context.config);

      if (!cfConfig.enabled) {
        return {
          agentId: 'control_flow',
          success: true,
          findings: [],
          metrics: {
            durationMs: Date.now() - startTime,
            filesProcessed: 0,
          },
        };
      }

      // Initialize budget
      const budget = new AnalysisBudget({
        maxDurationMs: cfConfig.timeBudgetMs,
        maxLinesChanged: cfConfig.sizeBudgetLines,
        maxCallDepth: cfConfig.maxCallDepth,
      });

      // Initialize mitigation detector with config
      const mitigationDetector = createMitigationDetector(cfConfig);

      // Filter to supported files and sort by priority (T063, T066)
      // High priority files (auth, security, api) are analyzed first
      const supportedFiles = context.files.filter((f) => this.supports(f));
      const sortedFiles = budget.sortFilesByPriority(supportedFiles);

      // Analyze each file with budget checks (T066)
      for (const file of sortedFiles) {
        // Check if we should continue at all
        if (!budget.shouldContinue()) {
          budget.addLog('warn', `Analysis terminated: budget exceeded`, {
            filesProcessed,
            functionsAnalyzed,
            status: budget.status,
          });
          break;
        }

        // Check if this specific file should be analyzed (T063)
        // Low priority files are skipped in degraded mode
        if (!budget.shouldAnalyzeFile(file.path)) {
          budget.addLog('debug', `Skipping file due to priority/budget: ${file.path}`, {
            status: budget.status,
            isDegraded: budget.isDegraded,
          });
          continue;
        }

        try {
          const fileFindings = await analyzeFile(
            file,
            context,
            budget,
            cfConfig,
            mitigationDetector
          );
          findings.push(...fileFindings);
          filesProcessed++;

          // Track functions analyzed from CFG building
          // This is approximate - actual count tracked in budget
        } catch (error) {
          budget.addLog('error', `Error analyzing file: ${file.path}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Log final budget stats
      const stats = budget.stats;
      budget.addLog('info', `Analysis complete`, {
        filesProcessed: stats.filesAnalyzed,
        filesSkipped: stats.filesSkipped,
        linesAnalyzed: stats.linesAnalyzed,
        status: stats.status,
        degraded: stats.degraded,
        timePercent: stats.timePercentUsed.toFixed(1),
        sizePercent: stats.sizePercentUsed.toFixed(1),
      });

      // Convert internal findings to router format
      const routerFindings = findings.map(convertToRouterFinding);

      // Get final budget stats for metrics
      const finalStats = budget.stats;

      return {
        agentId: 'control_flow',
        success: true,
        findings: routerFindings,
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed: finalStats.filesAnalyzed,
          filesSkipped: finalStats.filesSkipped,
          linesAnalyzed: finalStats.linesAnalyzed,
          budgetStatus: finalStats.status,
          degraded: finalStats.degraded,
        },
      };
    } catch (error) {
      return {
        agentId: 'control_flow',
        success: false,
        findings: [],
        metrics: {
          durationMs: Date.now() - startTime,
          filesProcessed,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

/**
 * Analyze a single file
 */
async function analyzeFile(
  file: DiffFile,
  context: AgentContext,
  budget: AnalysisBudget,
  config: ControlFlowConfig,
  mitigationDetector: MitigationDetector
): Promise<Finding[]> {
  const findings: Finding[] = [];

  // For control flow analysis, we need the full file content.
  // The DiffFile only has patch content. In a real implementation,
  // we would read the file from context.repoPath.
  // For now, we'll use the patch if available for demonstration.
  const content = file.patch || '';

  if (!content) {
    budget.addLog('debug', `Skipping file with no patch content: ${file.path}`);
    return findings;
  }

  // Record file analysis
  const lineCount = content.split('\n').length;
  budget.recordFile(lineCount);

  // Parse and build CFGs
  const sourceFile = parseSourceFile(content, file.path);
  const functions = findFunctions(sourceFile);

  // Detect mitigations in the file (T028: Integrate mitigation detection)
  const fileMitigations = mitigationDetector.detectInFile(sourceFile, file.path);
  budget.addLog('debug', `Detected ${fileMitigations.length} mitigations in ${file.path}`);

  for (const fn of functions) {
    if (!budget.shouldContinue()) {
      break;
    }

    try {
      const cfg = buildCFG(fn, sourceFile, file.path);

      // Annotate CFG nodes with mitigations based on line coverage
      for (const [_nodeId, node] of cfg.nodes) {
        const nodeMitigations = fileMitigations.filter(
          (m) => m.location.line >= node.lineStart && m.location.line <= node.lineEnd
        );
        node.mitigations.push(...nodeMitigations);
      }

      budget.addLog('debug', `Built CFG for function: ${cfg.functionName}`, {
        nodeCount: cfg.nodes.size,
        edgeCount: cfg.edges.length,
        callSiteCount: cfg.callSites.length,
        mitigationsInFunction: fileMitigations.filter(
          (m) => m.location.line >= cfg.startLine && m.location.line <= cfg.endLine
        ).length,
      });

      // TODO: Integrate path analysis (US2) - analyze paths and generate findings
      // TODO: Generate findings with reasoning (US3) - use FindingGenerator
    } catch (error) {
      budget.addLog('error', `Error building CFG for function in ${file.path}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return findings;
}

/**
 * Parse control flow configuration from main config
 */
function parseControlFlowConfig(config: AgentContext['config']): ControlFlowConfig {
  // Check if control_flow config exists in the raw config
  const rawConfig = (config as Record<string, unknown>)['control_flow'];

  if (rawConfig) {
    const result = ControlFlowConfigSchema.safeParse(rawConfig);
    if (result.success) {
      return result.data;
    }
  }

  // Return defaults
  return ControlFlowConfigSchema.parse({});
}

/**
 * Convert internal finding to router Finding format
 */
function convertToRouterFinding(finding: Finding): Finding {
  // The internal format already matches the router format
  return finding;
}

/**
 * Get file extension including the dot
 */
function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filePath.slice(lastDot).toLowerCase();
}

// Export for testing
export { analyzeFile, parseControlFlowConfig };
