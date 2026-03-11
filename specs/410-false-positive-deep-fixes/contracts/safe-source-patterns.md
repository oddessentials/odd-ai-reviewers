# Contract: Safe-Source Pattern Detection

**Module**: `router/src/agents/control_flow/safe-source-detector.ts`
**Depends on**: `safe-source-patterns.ts`, `vulnerability-detector.ts`, TypeScript compiler API

## Version

**Contract version**: 1.0 | **Pattern count**: 9

The pattern registry version and count MUST be exported as constants from `safe-source-patterns.ts` (`SAFE_SOURCE_REGISTRY_VERSION` and `EXPECTED_PATTERN_COUNT`). Unit tests MUST verify these match the contract to prevent silent addition or removal of suppression rules.

## Design Principles

1. **Conservative by default**: When in doubt, treat as tainted. False negatives (missed safe source) are acceptable; false negatives on real vulnerabilities are not.
1. **AST precedence over prompts**: Safe-source suppression takes precedence over LLM-generated findings for the same sink, because AST-verified safety is more precise than prompt-guided heuristics.
2. **Narrowly scoped predicates**: Each pattern matches a specific, provable AST shape. No heuristics, no "looks safe."
3. **Traceable decisions**: Every suppression is logged with the pattern ID that triggered it, enabling audit.

## Integration with VulnerabilityDetector

The safe-source check runs as a **filter step between findSources() and trackTaint()** in the `detectInFile()` method of `vulnerability-detector.ts`:

```text
1. findSinks()           → DetectedSink[]
2. findSources()         → DetectedSource[]
3. detectSafeSources()   → SafeSourceInstance[]     [NEW — inserted here]
4. filterSafeSources()   → filtered DetectedSource[] [NEW — remove safe from sources]
5. trackTaint()          → TaintedVariable[]
6. findAffectedVariable()→ PotentialVulnerability[]
```

This prevents safe data from ever entering the taint tracking system.

## Interface

### detectSafeSources(sourceFile: ts.SourceFile, filePath: string): SafeSourceInstance[]

Analyzes a TypeScript/JavaScript source file AST and returns all variables identified as provably non-tainted.

**Input**:
- `sourceFile`: Parsed TypeScript AST (ts.SourceFile)
- `filePath`: File path for location reporting

**Output**: Array of `SafeSourceInstance` with patternId, variableName, location, confidence.

**Behavior per pattern category**:

### Pattern 1: Constant Literal Declarations (FR-001)

**Matches**: Module-scope `const` declarations with literal initializers.

**Qualifying criteria** (ALL must be true):
1. Declaration uses `const` keyword (not `let`, not `var`)
2. Declaration is at module scope (parent is SourceFile or top-level block)
3. Initializer is one of:
   - String literal (`"hello"`)
   - Numeric literal (`42`)
   - Boolean literal (`true`, `false`)
   - Array literal where EVERY element is a string/numeric/boolean literal
4. The declared variable name does NOT appear on the left-hand side of any assignment expression elsewhere in the file (no mutation via alias)

**Does NOT match** (explicit non-goals):
- `const x = someFunction()` — function return values are not provably safe
- `const x = otherVariable` — variable references require alias tracking
- `const x = [...otherArray]` — spread expressions are not literal
- `const x = { key: value }` — object literals are mutable via property assignment
- `const x = template` + backtick literals with `${interpolation}` — interpolation may contain taint
- `let x = "literal"` — `let` permits reassignment
- Constants defined inside functions (not module scope)
- Imported constants (`import { X } from './config'`) — requires cross-module analysis

**Confidence**: `high`

### Pattern 2: Built-in Directory References (FR-002)

**Matches**: `__dirname`, `__filename`, `import.meta.dirname`, `import.meta.url`

**Qualifying criteria**:
1. Identifier text exactly matches one of the 4 built-in names
2. Used as a standalone expression or as an argument to path utilities

**Prevents taint for**: `path_traversal` only (not injection, not xss)

**Confidence**: `high`

### Pattern 3: Safe Directory Listing Returns (FR-003)

**Matches**: Return value of `fs.readdirSync(arg)` or `fs.promises.readdir(arg)` where `arg` is provably safe.

**Qualifying criteria for `arg`** (must be ONE of):
- A string literal (e.g., `"/static"`, `"./fixtures"`)
- A built-in directory reference (e.g., `__dirname`)
- A `path.join()` or `path.resolve()` call where EVERY argument is a string literal or built-in reference

**Does NOT match** (explicit non-goals):
- `fs.readdirSync(userInput)` — variable argument
- `fs.readdirSync(dir || __dirname)` — binary expression with fallback
- `fs.readdirSync(condition ? safeDir : unsafeDir)` — ternary
- `fs.readdirSync(path.join(__dirname, userInput))` — mixed safe/unsafe arguments
- `fs.readdirSync(envVar)` — environment variables

**Confidence**: `medium` (depends on argument analysis accuracy)

### Pattern 4: Constant Array Element Access (FR-004)

**Matches**: `CONST_ARRAY[index]` where CONST_ARRAY qualifies under Pattern 1.

**Qualifying criteria** (ALL must be true):
1. The array variable is identified as safe by Pattern 1
2. The element access uses the array variable directly (not an alias)
3. The array variable is never assigned to another variable in the file

**Does NOT match** (explicit non-goals):
- `alias[i]` where `const alias = CONST_ARRAY` — alias breaks provability
- `CONST_ARRAY[userInput]` — the INDEX doesn't matter for safety; what matters is whether the ARRAY contains only literals
- Nested arrays or objects within the array

**Confidence**: `high` (array contents are provably literal)

## Pattern Registry

| ID | Pattern | Matches | Prevents Taint For | Confidence |
|----|---------|---------|-------------------|------------|
| constant-literal-string | 1 | `const X = "literal"` | all | high |
| constant-literal-number | 1 | `const X = 42` | all | high |
| constant-literal-array | 1 | `const X = ["a", "b"]` | all | high |
| builtin-dirname | 2 | `__dirname` | path_traversal | high |
| builtin-filename | 2 | `__filename` | path_traversal | high |
| builtin-import-meta-dirname | 2 | `import.meta.dirname` | path_traversal | high |
| builtin-import-meta-url | 2 | `import.meta.url` | path_traversal | high |
| safe-readdir | 3 | `fs.readdirSync(safeArg)` | path_traversal | medium |
| constant-element-access | 4 | `CONST_ARRAY[i]` (no alias) | injection, xss | high |

## Intentional Exclusions (NOT Safe Sources)

The following are explicitly NOT treated as safe sources and MUST remain tainted:

| Exclusion | Reason |
|-----------|--------|
| Environment variables (`process.env.X`) | Not provably constant at runtime; can be attacker-influenced in some deployments |
| Type assertions (`x as SafeType`) | No runtime semantics; TypeScript erases at compile time |
| Imported constants (`import { X } from './config'`) | Requires cross-module alias analysis beyond current scope |
| Code comments/annotations (`// safe`, `@safe`) | Not machine-verifiable |
| Object literals (`const X = { a: 1 }`) | Properties are mutable even on const references |
| Template literals with interpolation (`` `prefix${expr}` ``) | Interpolation may contain tainted data |
| Function return values (`const X = fn()`) | Return value not provably safe without interprocedural analysis |
| Aliased constants (`const Y = X`) | Alias chain creates mutation risk |

## Performance Constraints

- Safe-source detection MUST complete within 50ms per file (within existing control-flow budget)
- Pattern matching uses AST node type checks (O(n) in file size), not regex on source text
- Must not throw on malformed AST nodes (graceful degradation: treat as tainted)
