/**
 * Mitigation Detector
 *
 * Matches AST nodes against mitigation patterns to identify security mitigations.
 * Implements T025-T028, T056, T057 of the control flow analysis feature.
 *
 * Per FR-006: Maps mitigations to specific vulnerability types.
 * Per FR-007: Tracks mitigation instances with scope for path analysis.
 * Per FR-017: Logs when custom patterns are evaluated and whether they matched.
 */

import ts from 'typescript';
import type {
  MitigationPattern,
  MitigationInstance,
  MitigationScope,
  Confidence,
  VulnerabilityType,
  SourceLocation,
  MatchCriteria,
  ControlFlowConfig,
  PatternEvaluationResult,
  PatternTimeoutInfo,
  CallChainEntry,
  CrossFileMitigationInfo,
} from './types.js';
import { BUILTIN_PATTERNS } from './mitigation-patterns.js';
import { getLogger, type AnalysisLogger } from './logger.js';
import { createTimeoutRegex } from './timeout-regex.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Context for mitigation detection within a file.
 */
export interface DetectionContext {
  sourceFile: ts.SourceFile;
  filePath: string;
  config: ControlFlowConfig;
  /** Import map: import name -> module name */
  imports: Map<string, string>;
}

/**
 * Result of pattern matching against an AST node.
 */
export interface MatchResult {
  matched: boolean;
  patternId: string;
  confidence: Confidence;
  protectedVariables: string[];
  scope: MitigationScope;
}

// =============================================================================
// MitigationDetector Class
// =============================================================================

/**
 * Detects security mitigations in TypeScript/JavaScript AST.
 *
 * The detector walks AST nodes and matches them against configured patterns
 * to identify where security checks or sanitization has been applied.
 */
export class MitigationDetector {
  private patterns: MitigationPattern[];
  private patternsByType: Map<string, MitigationPattern[]>;
  private disabledPatterns: Set<string>;
  private customPatternIds: Set<string>;
  private logger: AnalysisLogger;
  private patternTimeoutMs: number;
  private patternTimeouts: PatternTimeoutInfo[] = [];
  private patternEvaluations: PatternEvaluationResult[] = [];
  private crossFileMitigations: CrossFileMitigationInfo[] = [];

  constructor(config?: Partial<ControlFlowConfig>, logger?: AnalysisLogger) {
    this.logger = logger ?? getLogger();
    this.customPatternIds = new Set<string>();
    this.patternTimeoutMs = config?.patternTimeoutMs ?? 100;
    // Start with built-in patterns
    this.patterns = [...BUILTIN_PATTERNS];

    // Add custom patterns from config (T056)
    if (config?.mitigationPatterns) {
      for (const pattern of config.mitigationPatterns) {
        this.patterns.push(pattern);
        this.customPatternIds.add(pattern.id);
      }
    }

    // Apply pattern overrides
    if (config?.patternOverrides) {
      for (const override of config.patternOverrides) {
        const pattern = this.patterns.find((p) => p.id === override.patternId);
        if (pattern) {
          if (override.confidence) pattern.confidence = override.confidence;
          if (override.deprecated !== undefined) pattern.deprecated = override.deprecated;
          if (override.deprecationReason) pattern.deprecationReason = override.deprecationReason;
        }
      }
    }

    // Track disabled patterns
    this.disabledPatterns = new Set(config?.disabledPatterns || []);

    // Build type index for fast lookup
    this.patternsByType = new Map();
    for (const pattern of this.patterns) {
      if (this.disabledPatterns.has(pattern.id) || pattern.deprecated) {
        continue;
      }
      const matchType = pattern.match.type;
      const existing = this.patternsByType.get(matchType);
      if (existing) {
        existing.push(pattern);
      } else {
        this.patternsByType.set(matchType, [pattern]);
      }
    }
  }

  /**
   * Detect mitigations in a source file.
   * Returns all mitigation instances found.
   */
  detectInFile(sourceFile: ts.SourceFile, filePath: string): MitigationInstance[] {
    const instances: MitigationInstance[] = [];
    const imports = this.extractImports(sourceFile);

    const context: DetectionContext = {
      sourceFile,
      filePath,
      config: { enabled: true } as ControlFlowConfig,
      imports,
    };

    const visit = (node: ts.Node) => {
      const mitigations = this.detectAtNode(node, context);
      instances.push(...mitigations);
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return instances;
  }

  /**
   * Detect mitigations at a specific AST node.
   * Called during CFG construction to annotate nodes.
   */
  detectAtNode(node: ts.Node, context: DetectionContext): MitigationInstance[] {
    const instances: MitigationInstance[] = [];

    // Check call expressions (function_call, method_call)
    if (ts.isCallExpression(node)) {
      const callMitigations = this.matchCallExpression(node, context);
      instances.push(...callMitigations);
    }

    // Check binary expressions (type guards, null checks)
    if (ts.isBinaryExpression(node)) {
      const binaryMitigations = this.matchBinaryExpression(node, context);
      instances.push(...binaryMitigations);
    }

    // Check typeof expressions
    if (ts.isTypeOfExpression(node)) {
      const typeofMitigations = this.matchTypeofExpression(node, context);
      instances.push(...typeofMitigations);
    }

    // Check property access with optional chaining
    if (ts.isPropertyAccessExpression(node) && node.questionDotToken) {
      const optionalMitigations = this.matchOptionalChaining(node, context);
      instances.push(...optionalMitigations);
    }

    // Check element access with optional chaining
    if (ts.isElementAccessExpression(node) && node.questionDotToken) {
      const optionalMitigations = this.matchOptionalChaining(node, context);
      instances.push(...optionalMitigations);
    }

    return instances;
  }

  /**
   * Match a call expression against patterns.
   */
  private matchCallExpression(
    node: ts.CallExpression,
    context: DetectionContext
  ): MitigationInstance[] {
    const instances: MitigationInstance[] = [];

    // Get callable name and module
    const { name, moduleName, isMethodCall } = this.getCallableInfo(node, context);
    if (!name) return instances;

    // Get patterns for this call type
    const matchType = isMethodCall ? 'method_call' : 'function_call';
    const patterns = this.patternsByType.get(matchType) || [];

    for (const pattern of patterns) {
      // For method calls, also try matching without module if module is specified but not found
      // This handles cases like `schema.parse()` where schema is a variable typed by zod
      const matchesWithModule = this.matchesPattern(pattern.match, name, moduleName, pattern.id);
      const matchesWithoutModule = pattern.match.module
        ? this.matchesPattern({ ...pattern.match, module: undefined }, name, undefined, pattern.id)
        : false;

      const matched = matchesWithModule || matchesWithoutModule;

      // FR-017: Log custom pattern evaluation for determinism verification
      if (this.customPatternIds.has(pattern.id)) {
        this.logger.logCustomPatternEvaluation(pattern.id, matched);
      }

      if (matched) {
        const location = this.getLocation(node, context);
        const protectedVars = this.extractProtectedVariables(node, context);

        // Log mitigation match
        this.logger.logMitigationMatch(pattern.id, location, pattern.mitigates[0] ?? 'unknown');

        instances.push({
          patternId: pattern.id,
          location,
          protectedVariables: protectedVars,
          protectedPaths: [], // Will be computed during path analysis
          scope: this.determineScope(node, context),
          confidence: matchesWithModule ? pattern.confidence : 'medium', // Lower confidence if module not verified
        });
      }
    }

    return instances;
  }

  /**
   * Match a binary expression (null checks, instanceof, etc.).
   */
  private matchBinaryExpression(
    node: ts.BinaryExpression,
    context: DetectionContext
  ): MitigationInstance[] {
    const instances: MitigationInstance[] = [];
    const op = node.operatorToken.kind;

    // Check instanceof
    if (op === ts.SyntaxKind.InstanceOfKeyword) {
      const patterns = this.patternsByType.get('instanceof_check') || [];
      for (const pattern of patterns) {
        instances.push(this.createMitigationFromBinary(node, pattern, context));
      }
      return instances;
    }

    // Check null/undefined comparisons
    if (this.isNullCheck(node)) {
      const patterns = this.patternsByType.get('type_guard') || [];
      for (const pattern of patterns) {
        if (this.matchesNullCheckPattern(node, pattern)) {
          instances.push(this.createMitigationFromBinary(node, pattern, context));
        }
      }
    }

    return instances;
  }

  /**
   * Match a typeof expression.
   */
  private matchTypeofExpression(
    node: ts.TypeOfExpression,
    context: DetectionContext
  ): MitigationInstance[] {
    const instances: MitigationInstance[] = [];
    const patterns = this.patternsByType.get('typeof_check') || [];

    for (const pattern of patterns) {
      const location = this.getLocation(node, context);
      const protectedVar = this.extractVariableName(node.expression);

      instances.push({
        patternId: pattern.id,
        location,
        protectedVariables: protectedVar ? [protectedVar] : [],
        protectedPaths: [],
        scope: this.determineScope(node, context),
        confidence: pattern.confidence,
      });
    }

    return instances;
  }

  /**
   * Match optional chaining expressions.
   */
  private matchOptionalChaining(
    node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
    context: DetectionContext
  ): MitigationInstance[] {
    const instances: MitigationInstance[] = [];
    const patterns = this.patternsByType.get('type_guard') || [];

    for (const pattern of patterns) {
      if (pattern.id === 'optional-chaining') {
        const location = this.getLocation(node, context);
        const protectedVar = this.extractVariableName(node.expression);

        instances.push({
          patternId: pattern.id,
          location,
          protectedVariables: protectedVar ? [protectedVar] : [],
          protectedPaths: [],
          scope: 'block', // Optional chaining protects at expression level
          confidence: pattern.confidence,
        });
      }
    }

    return instances;
  }

  /**
   * Check if a binary expression is a null/undefined check.
   */
  private isNullCheck(node: ts.BinaryExpression): boolean {
    const op = node.operatorToken.kind;
    const isEquality =
      op === ts.SyntaxKind.EqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken;

    if (!isEquality) return false;

    return (
      node.left.kind === ts.SyntaxKind.NullKeyword ||
      node.right.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(node.left) && node.left.text === 'undefined') ||
      (ts.isIdentifier(node.right) && node.right.text === 'undefined')
    );
  }

  /**
   * Match a null check pattern against a binary expression.
   */
  private matchesNullCheckPattern(node: ts.BinaryExpression, pattern: MitigationPattern): boolean {
    const op = node.operatorToken.kind;
    const isStrictEquality =
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken;
    const isLooseEquality =
      op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;

    const hasNull =
      node.left.kind === ts.SyntaxKind.NullKeyword || node.right.kind === ts.SyntaxKind.NullKeyword;
    const hasUndefined =
      (ts.isIdentifier(node.left) && node.left.text === 'undefined') ||
      (ts.isIdentifier(node.right) && node.right.text === 'undefined');

    // Match specific patterns by ID
    if (pattern.id === 'null-check-strict' && isStrictEquality && hasNull) {
      return true;
    }
    if (pattern.id === 'undefined-check-strict' && isStrictEquality && hasUndefined) {
      return true;
    }
    if (pattern.id === 'nullish-check' && isLooseEquality && hasNull) {
      return true;
    }

    return false;
  }

  /**
   * Get information about a callable (function/method name and module).
   */
  private getCallableInfo(
    node: ts.CallExpression,
    context: DetectionContext
  ): { name: string | undefined; moduleName: string | undefined; isMethodCall: boolean } {
    const expr = node.expression;

    // Method call: obj.method() or obj?.method()
    if (ts.isPropertyAccessExpression(expr)) {
      const methodName = expr.name.text;
      const receiverName = this.extractVariableName(expr.expression);
      const moduleName = receiverName ? context.imports.get(receiverName) : undefined;
      return { name: methodName, moduleName, isMethodCall: true };
    }

    // Direct function call: fn()
    if (ts.isIdentifier(expr)) {
      const fnName = expr.text;
      const moduleName = context.imports.get(fnName);
      return { name: fnName, moduleName, isMethodCall: false };
    }

    return { name: undefined, moduleName: undefined, isMethodCall: false };
  }

  /**
   * Check if a call matches a pattern's criteria.
   * Uses timeout-protected regex evaluation for namePattern matching.
   */
  private matchesPattern(
    criteria: MatchCriteria,
    name: string,
    moduleName?: string,
    patternId?: string
  ): boolean {
    // Check exact name match
    if (criteria.name && criteria.name !== name) {
      return false;
    }

    // Check name pattern match with timeout protection
    if (criteria.namePattern) {
      const timeoutRegex = createTimeoutRegex(
        criteria.namePattern,
        patternId ?? 'unknown',
        this.patternTimeoutMs
      );
      const result = timeoutRegex.test(name);

      // Track evaluation result
      this.patternEvaluations.push(result);

      // Handle timeout (FR-002: treat as non-matching)
      if (result.timedOut) {
        this.patternTimeouts.push({
          patternId: result.patternId,
          elapsedMs: result.elapsedMs,
        });
        this.logger.logPatternTimeout(result.patternId, result.inputLength, result.elapsedMs);
        return false;
      }

      // Log evaluation for debugging
      this.logger.logPatternEvaluated(
        result.patternId,
        result.matched,
        result.elapsedMs,
        result.inputLength
      );

      if (!result.matched) {
        return false;
      }
    }

    // Check module match
    if (criteria.module && moduleName !== criteria.module) {
      return false;
    }

    return true;
  }

  /**
   * Create a mitigation instance from a binary expression.
   */
  private createMitigationFromBinary(
    node: ts.BinaryExpression,
    pattern: MitigationPattern,
    context: DetectionContext
  ): MitigationInstance {
    const location = this.getLocation(node, context);
    const protectedVar =
      this.extractVariableName(node.left) || this.extractVariableName(node.right);

    return {
      patternId: pattern.id,
      location,
      protectedVariables: protectedVar ? [protectedVar] : [],
      protectedPaths: [],
      scope: this.determineScope(node, context),
      confidence: pattern.confidence,
    };
  }

  /**
   * Extract import declarations from source file.
   */
  private extractImports(sourceFile: ts.SourceFile): Map<string, string> {
    const imports = new Map<string, string>();

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;

      const moduleName = statement.moduleSpecifier.text;
      const clause = statement.importClause;

      if (!clause) continue;

      // Default import: import x from 'module'
      if (clause.name) {
        imports.set(clause.name.text, moduleName);
      }

      // Named imports: import { x, y } from 'module'
      if (clause.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            imports.set(element.name.text, moduleName);
          }
        }
        // Namespace import: import * as x from 'module'
        if (ts.isNamespaceImport(clause.namedBindings)) {
          imports.set(clause.namedBindings.name.text, moduleName);
        }
      }
    }

    return imports;
  }

  /**
   * Extract variable name from an expression.
   */
  private extractVariableName(expr: ts.Expression): string | undefined {
    if (ts.isIdentifier(expr)) {
      return expr.text;
    }
    if (ts.isPropertyAccessExpression(expr)) {
      return this.extractVariableName(expr.expression);
    }
    return undefined;
  }

  /**
   * Extract variables protected by a call expression.
   */
  private extractProtectedVariables(node: ts.CallExpression, _context: DetectionContext): string[] {
    const vars: string[] = [];

    // Check if result is assigned
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      vars.push(parent.name.text);
    }

    // Check arguments for tainted variables
    for (const arg of node.arguments) {
      const varName = this.extractVariableName(arg);
      if (varName) {
        vars.push(varName);
      }
    }

    return vars;
  }

  /**
   * Determine the scope of a mitigation.
   */
  private determineScope(node: ts.Node, _context: DetectionContext): MitigationScope {
    // Check if inside a function
    let current: ts.Node | undefined = node.parent;
    while (current) {
      if (
        ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current) ||
        ts.isMethodDeclaration(current)
      ) {
        return 'function';
      }
      if (ts.isBlock(current)) {
        return 'block';
      }
      current = current.parent;
    }

    return 'module';
  }

  /**
   * Get source location for a node.
   */
  private getLocation(node: ts.Node, context: DetectionContext): SourceLocation {
    const start = context.sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = context.sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    return {
      file: context.filePath,
      line: start.line + 1,
      column: start.character,
      endLine: end.line + 1,
      endColumn: end.character,
    };
  }

  /**
   * Get all patterns that mitigate a specific vulnerability type.
   */
  getPatternsForVulnerability(vulnType: VulnerabilityType): MitigationPattern[] {
    return this.patterns.filter(
      (p) => p.mitigates.includes(vulnType) && !this.disabledPatterns.has(p.id) && !p.deprecated
    );
  }

  /**
   * Get a pattern by ID.
   */
  getPatternById(id: string): MitigationPattern | undefined {
    if (this.disabledPatterns.has(id)) return undefined;
    const pattern = this.patterns.find((p) => p.id === id);
    if (pattern?.deprecated) return undefined;
    return pattern;
  }

  /**
   * Get all active patterns.
   */
  getActivePatterns(): MitigationPattern[] {
    return this.patterns.filter((p) => !this.disabledPatterns.has(p.id) && !p.deprecated);
  }

  /**
   * Get pattern timeout info collected during detection.
   * Used to populate finding metadata with timeout indicators.
   */
  getPatternTimeouts(): PatternTimeoutInfo[] {
    return [...this.patternTimeouts];
  }

  /**
   * Get all pattern evaluation results collected during detection.
   */
  getPatternEvaluations(): PatternEvaluationResult[] {
    return [...this.patternEvaluations];
  }

  /**
   * Clear collected pattern timeout, evaluation, and cross-file mitigation info.
   * Call this before starting a new analysis session.
   */
  clearPatternStats(): void {
    this.patternTimeouts = [];
    this.patternEvaluations = [];
    this.crossFileMitigations = [];
  }

  /**
   * Check if any patterns timed out during evaluation.
   */
  hasPatternTimeouts(): boolean {
    return this.patternTimeouts.length > 0;
  }

  // =============================================================================
  // Cross-File Mitigation Tracking (FR-006 to FR-011)
  // =============================================================================

  /**
   * Create a mitigation instance with cross-file tracking info.
   *
   * @param baseInstance The base mitigation instance
   * @param vulnerabilityFile The file containing the vulnerability
   * @param callChain The call chain from vulnerability to mitigation
   * @returns MitigationInstance with cross-file tracking fields populated
   */
  createCrossFileMitigation(
    baseInstance: MitigationInstance,
    vulnerabilityFile: string,
    callChain: CallChainEntry[]
  ): MitigationInstance {
    const mitigationFile = baseInstance.location.file;
    const isCrossFile = mitigationFile !== vulnerabilityFile;

    if (!isCrossFile) {
      return baseInstance;
    }

    // Calculate discovery depth (number of calls away from vulnerability)
    const discoveryDepth = callChain.length > 0 ? callChain.length - 1 : 0;

    // Track cross-file mitigation for finding metadata
    const crossFileInfo: CrossFileMitigationInfo = {
      patternId: baseInstance.patternId,
      file: mitigationFile,
      line: baseInstance.location.line,
      depth: discoveryDepth,
      functionName:
        callChain.length > 0 ? callChain[callChain.length - 1]?.functionName : undefined,
    };
    this.crossFileMitigations.push(crossFileInfo);

    // Log cross-file mitigation detection (FR-011)
    this.logger.logCrossFileMitigation(
      vulnerabilityFile,
      mitigationFile,
      baseInstance.location.line,
      discoveryDepth,
      baseInstance.patternId
    );

    // Log complete call chain for verbose mode
    if (callChain.length > 0) {
      this.logger.logCallChainComplete(baseInstance.patternId, callChain);
    }

    return {
      ...baseInstance,
      callChain: callChain.length > 0 ? callChain : undefined,
      discoveryDepth,
    };
  }

  /**
   * Build a call chain entry from function and location info.
   */
  buildCallChainEntry(file: string, functionName: string, line: number): CallChainEntry {
    return { file, functionName, line };
  }

  /**
   * Get cross-file mitigations collected during detection.
   */
  getCrossFileMitigations(): CrossFileMitigationInfo[] {
    return [...this.crossFileMitigations];
  }

  /**
   * Check if any cross-file mitigations were detected.
   */
  hasCrossFileMitigations(): boolean {
    return this.crossFileMitigations.length > 0;
  }

  /**
   * Clear collected cross-file mitigation info.
   */
  clearCrossFileMitigations(): void {
    this.crossFileMitigations = [];
  }
}

// =============================================================================
// Factory function
// =============================================================================

/**
 * Create a mitigation detector with the given configuration.
 */
export function createMitigationDetector(
  config?: Partial<ControlFlowConfig>,
  logger?: AnalysisLogger
): MitigationDetector {
  return new MitigationDetector(config, logger);
}
