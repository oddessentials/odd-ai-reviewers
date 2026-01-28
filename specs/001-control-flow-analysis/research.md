# Research: Control Flow Analysis & Mitigation Recognition

**Feature**: 001-control-flow-analysis
**Date**: 2026-01-27
**Status**: Complete

## Research Questions

### RQ-1: AST Parsing Library for TypeScript/JavaScript

**Decision**: Use TypeScript Compiler API (`typescript` package)

**Rationale**:

- Native support for TypeScript and JavaScript (including JSX/TSX)
- Provides type information needed for accurate data flow tracking
- Already familiar to TypeScript developers
- No external binary dependencies (pure JS)
- Maintained by Microsoft with stable API

**Alternatives Considered**:

| Alternative    | Pros              | Cons                                    | Rejected Because                |
| -------------- | ----------------- | --------------------------------------- | ------------------------------- |
| Babel Parser   | Fast, widely used | No type info, separate TS plugin needed | Missing type-aware analysis     |
| ESTree (Acorn) | Lightweight, fast | JS only, no TS support                  | V1 requires TypeScript          |
| ts-morph       | Higher-level API  | Additional abstraction layer            | Unnecessary indirection         |
| SWC            | Very fast (Rust)  | WASM dependency, less mature TS API     | Environment discipline concerns |

**Implementation Notes**:

- Use `ts.createProgram()` for multi-file analysis with type checking
- Use `ts.createSourceFile()` for single-file fast parsing when types not needed
- Pin `typescript` version to match project's `tsconfig.json` target

---

### RQ-2: Control Flow Graph Representation

**Decision**: Custom CFG implementation with basic blocks and edges

**Rationale**:

- Existing CFG libraries (e.g., `cfg-js`) don't support TypeScript or mitigation tracking
- Custom implementation allows direct integration with mitigation detection
- Simpler than full data flow analysis frameworks (TAJS, CodeQL)
- Meets bounded complexity requirements (max 5 call depth)

**Data Structures**:

```typescript
interface CFGNode {
  id: string;
  type: 'entry' | 'exit' | 'basic' | 'branch' | 'merge' | 'call' | 'return';
  statements: ts.Statement[];
  mitigations: MitigationInstance[];
}

interface CFGEdge {
  from: string;
  to: string;
  condition?: ts.Expression; // For branch edges
  isExceptionEdge?: boolean;
}

interface ControlFlowGraph {
  functionId: string;
  nodes: Map<string, CFGNode>;
  edges: CFGEdge[];
  entryNode: string;
  exitNodes: string[];
}
```

**Alternatives Considered**:

| Alternative  | Pros                       | Cons                          | Rejected Because               |
| ------------ | -------------------------- | ----------------------------- | ------------------------------ |
| CodeQL       | Powerful, enterprise-grade | Heavy setup, separate process | Constitution VII (environment) |
| TAJS         | Academic rigor             | Java-based, complex           | Not Node.js native             |
| Joern        | Security-focused           | Requires JVM, Scala           | Environment discipline         |
| Esprima flow | Lightweight                | JS only, unmaintained         | No TypeScript support          |

---

### RQ-3: Mitigation Pattern Representation

**Decision**: Declarative JSON schema with Zod validation

**Rationale**:

- Allows custom patterns (FR-014) without code changes
- Zod validation ensures patterns are side-effect-free (FR-015)
- JSON is human-readable for security team configuration
- Easy to version control and audit

**Pattern Schema**:

```typescript
const MitigationPatternSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  mitigates: z.array(z.enum(['injection', 'null_deref', 'auth_bypass', 'xss', 'path_traversal'])),
  match: z.object({
    type: z.enum(['function_call', 'method_call', 'type_guard', 'assignment']),
    name: z.string().optional(),
    namePattern: z.string().optional(), // Regex pattern
    module: z.string().optional(),
    parameters: z
      .array(
        z.object({
          index: z.number(),
          constraint: z.enum(['any', 'string', 'tainted_source']),
        })
      )
      .optional(),
    returnConstraint: z.enum(['truthy', 'defined', 'sanitized']).optional(),
  }),
  confidence: z.enum(['high', 'medium', 'low']),
  deprecated: z.boolean().optional(),
  deprecationReason: z.string().optional(),
});
```

**Built-in Patterns (V1)**:

| Category          | Pattern Examples                                                                |
| ----------------- | ------------------------------------------------------------------------------- |
| Input Validation  | `validator.isEmail()`, `zod.parse()`, `joi.validate()`                          |
| Output Encoding   | `encodeURIComponent()`, `DOMPurify.sanitize()`, template literals with escaping |
| Null Checks       | `if (x != null)`, `x?.`, `x ?? default`, TypeScript narrowing                   |
| Auth Checks       | `isAuthenticated()`, `hasPermission()`, `requireAuth()` middleware              |
| Path Sanitization | `path.normalize()`, `path.resolve()` with base check                            |

---

### RQ-4: Inter-Procedural Analysis Strategy

**Decision**: Bounded call-site expansion with conservative fallback

**Rationale**:

- Unlimited expansion causes exponential blowup
- 5-level default matches common mitigation patterns (wrapper → validator → core)
- Conservative fallback (assume unmitigated) prevents false negatives
- Caching of function summaries enables reuse

**Algorithm**:

```
function analyzeFunction(fn, depth, budget):
  if depth > MAX_DEPTH or budget.exhausted():
    return ConservativeResult(unmitigated=true, degraded=true)

  cfg = buildCFG(fn)

  for callSite in cfg.callSites:
    callee = resolveCallee(callSite)
    if callee is external or dynamic:
      callResult = ConservativeResult()
    else if callee in cache:
      callResult = cache[callee]
    else:
      callResult = analyzeFunction(callee, depth + 1, budget)
      cache[callee] = callResult

    propagateMitigations(cfg, callSite, callResult)

  return summarize(cfg)
```

**Depth Limit Handling**:

- At depth limit: Log warning, mark findings as "degraded confidence"
- Beyond limit: Skip analysis, assume worst case (no mitigation)
- In output: Include depth-limited indicator per FR-020

---

### RQ-5: Async Boundary Handling

**Decision**: Intra-function tracking with conservative cross-function fallback

**Rationale**:

- `await` within same function preserves mitigation context
- Cross-function async (callbacks, Promise chains) is complex to track accurately
- Conservative fallback aligns with spec (FR-022, FR-023)
- Best-effort for common patterns (async/await in same scope)

**Supported Patterns**:

```typescript
// SUPPORTED: Same-function async
async function handler(input: string) {
  const sanitized = sanitize(input); // Mitigation applied
  const result = await db.query(sanitized); // Tracked
  return result;
}

// BEST-EFFORT: Promise chain (may miss mitigation)
function handler(input: string) {
  return sanitize(input).then((sanitized) => db.query(sanitized)); // Conservative
}

// OUT OF SCOPE: Callback-based
function handler(input: string, callback: Function) {
  sanitize(input, (err, sanitized) => {
    db.query(sanitized, callback); // Not tracked
  });
}
```

---

### RQ-6: Performance Budget Implementation

**Decision**: Incremental analysis with early termination

**Rationale**:

- 5-minute budget requires ability to stop mid-analysis
- Incremental approach allows partial results when budget exceeded
- Deterministic degradation (same input → same degraded output)
- Priority order: critical files first, then by change size

**Implementation**:

```typescript
interface AnalysisBudget {
  startTime: number;
  maxDurationMs: number; // Default: 300_000 (5 min)
  maxLinesChanged: number; // Default: 10_000
  linesAnalyzed: number;
  filesAnalyzed: number;
  degraded: boolean;

  check(): BudgetStatus; // 'ok' | 'warning' | 'exceeded'
  recordFile(lines: number): void;
}
```

**Degradation Strategy**:

1. **Warning (80% budget)**: Reduce call depth to 3, skip low-priority files
2. **Exceeded (100% budget)**: Stop new file analysis, complete current file, report partial results
3. **Hard limit (110% budget)**: Force terminate, report what's available

---

### RQ-7: Finding Fingerprint Strategy

**Decision**: Content-based fingerprint with location normalization

**Rationale**:

- Must integrate with existing dedup system (router/src/report/formats.ts)
- Line numbers change frequently; normalize to function/statement level
- Include mitigation context in fingerprint for accurate dedup

**Fingerprint Algorithm**:

```typescript
function generateFingerprint(finding: ControlFlowFinding): string {
  const normalized = {
    ruleId: finding.ruleId,
    file: finding.file,
    functionName: finding.enclosingFunction,
    issueType: finding.issueType,
    mitigationStatus: finding.mitigationStatus, // none | partial | full
  };
  return sha256(JSON.stringify(normalized));
}
```

**Dedup Behavior**:

- Same issue with different mitigation status = different fingerprint
- Allows tracking when mitigation is added/removed across commits
- Cross-agent dedup still works (sourceAgent not in fingerprint)

---

## Technology Summary

| Component      | Technology              | Version  | Rationale                          |
| -------------- | ----------------------- | -------- | ---------------------------------- |
| AST Parser     | TypeScript Compiler API | ^5.x     | Native TS support, type info       |
| CFG            | Custom implementation   | N/A      | Tailored to mitigation needs       |
| Pattern Config | JSON + Zod              | zod ^4.x | Declarative, validated, extensible |
| Testing        | Vitest                  | ^4.x     | Project standard                   |
| Logging        | Existing logger         | N/A      | Constitution compliance            |

## Open Questions Resolved

1. ~~Which AST parser to use?~~ → TypeScript Compiler API
2. ~~How to represent CFG?~~ → Custom nodes/edges with mitigation tracking
3. ~~How deep for inter-procedural?~~ → 5 levels default, configurable
4. ~~How to handle async?~~ → Intra-function tracked, cross-function conservative
5. ~~What's the budget mechanism?~~ → Time + size with incremental degradation
6. ~~How do fingerprints work?~~ → Content-based with function-level normalization

## References

- TypeScript Compiler API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
- Existing Finding schema: `router/src/agents/types.ts`
- Existing dedup logic: `router/src/report/formats.ts`
- Constitution: `.specify/memory/constitution.md`
