# Implementation Plan: Control Flow Analysis & Mitigation Recognition

**Branch**: `001-control-flow-analysis` | **Date**: 2026-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-control-flow-analysis/spec.md`

## Summary

Add control flow-aware static analysis and mitigation recognition to the code review tool to reduce false positives. The implementation will:

1. Create a new agent (`control_flow_agent`) that parses TypeScript/JavaScript AST to build control flow graphs
2. Track data flow through conditionals, loops, and function calls to identify reachable paths
3. Recognize common mitigation patterns (input validation, null checks, auth checks) and associate them with risks they address
4. Suppress findings only when mitigations cover ALL paths; downgrade severity for partial coverage
5. Provide contextual feedback explaining the analysis reasoning

This addresses enterprise customer feedback that the tool uses "static analysis that doesn't follow control flow or recognize existing mitigations."

## Technical Context

**Language/Version**: TypeScript 5.x (ES2022 target, NodeNext modules), Node.js >=22.0.0
**Primary Dependencies**:

- Existing: `@anthropic-ai/sdk`, `openai`, `@octokit/rest`, `zod`, `yaml`
- New: `typescript` (for AST parsing and type checker API)
  **Storage**: N/A (ephemeral workspace per constitution)
  **Testing**: Vitest 4.x with v8 coverage
  **Target Platform**: Linux server (CI environment), GitHub Actions / Azure Pipelines
  **Project Type**: Single project (npm workspace with `router/` as primary)
  **Performance Goals**:
- Analysis completes within 5-minute time budget per PR (FR-018)
- 10,000 lines changed per PR size budget (FR-019)
- 99% of PRs complete within budget (AG-003)
  **Constraints**:
- Max 5 levels inter-procedural call depth (FR-003)
- Deterministic output (same input → same output)
- No network calls, timestamps, or random values during analysis
  **Scale/Scope**:
- V1: TypeScript/JavaScript only
- Test suite: 500+ mitigation pattern cases (AG-002)
- Benchmark corpus for performance validation

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                            | Status  | Compliance Notes                                                                                       |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------ |
| **I. Router Owns All Posting**       | ✅ PASS | New agent returns `Finding[]` via standard interface; does not post directly                           |
| **II. Structured Findings Contract** | ✅ PASS | Agent produces canonical Finding schema with tool identifier, severity, message, location, fingerprint |
| **III. Provider-Neutral Core**       | ✅ PASS | Control flow analysis is provider-agnostic; no GitHub/ADO specific code                                |
| **IV. Security-First Design**        | ✅ PASS | Treats PR code as untrusted input for parsing; no secrets in agent subprocess                          |
| **V. Deterministic Outputs**         | ✅ PASS | FR-021 requires deterministic results; no external dependencies, logged decisions                      |
| **VI. Bounded Resources**            | ✅ PASS | Time budget (5 min), size budget (10K lines), call depth limit (5 levels) with degraded mode           |
| **VII. Environment Discipline**      | ✅ PASS | Uses pinned TypeScript parser; no curl\|bash installers                                                |
| **VIII. Explicit Non-Goals**         | ✅ PASS | Does not become CI runner; operates within existing agent framework                                    |

**Quality Gates**:

- Zero-tolerance lint: Agent code passes ESLint with `--max-warnings 0`
- Security linting: No `detect-child-process` violations (uses TypeScript API, not subprocess)
- Dependency architecture: No circular dependencies introduced
- Local = CI parity: Pre-commit hooks enforce same checks

## Project Structure

### Documentation (this feature)

```text
specs/001-control-flow-analysis/
├── plan.md              # This file
├── research.md          # Phase 0: Technology decisions
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Developer guide
├── contracts/           # Phase 1: API contracts
│   └── finding-schema.ts
└── tasks.md             # Phase 2: Implementation tasks
```

### Source Code (repository root)

```text
router/
├── src/
│   ├── agents/
│   │   ├── types.ts                    # Existing: ReviewAgent interface
│   │   ├── index.ts                    # Existing: Agent registry
│   │   ├── control_flow/               # NEW: Control flow analysis module
│   │   │   ├── index.ts                # Agent entry point
│   │   │   ├── cfg-builder.ts          # Control flow graph construction
│   │   │   ├── path-analyzer.ts        # Reachability analysis
│   │   │   ├── mitigation-detector.ts  # Pattern matching for mitigations
│   │   │   ├── mitigation-patterns.ts  # Built-in pattern definitions
│   │   │   ├── finding-generator.ts    # Finding creation with reasoning
│   │   │   └── types.ts                # CFG, Path, Mitigation types
│   │   └── ...existing agents
│   ├── config/
│   │   ├── schemas.ts                  # UPDATE: Add control_flow to AgentSchema
│   │   └── mitigation-config.ts        # NEW: Custom pattern configuration
│   └── report/
│       └── formats.ts                  # Existing: Fingerprint/dedup (no changes)
├── tests/
│   ├── unit/
│   │   └── agents/
│   │       └── control_flow/           # NEW: Unit tests
│   │           ├── cfg-builder.test.ts
│   │           ├── path-analyzer.test.ts
│   │           ├── mitigation-detector.test.ts
│   │           └── finding-generator.test.ts
│   └── integration/
│       └── control_flow.test.ts        # NEW: End-to-end agent tests
└── package.json                        # UPDATE: Add typescript dependency
```

**Structure Decision**: Extends existing single-project structure in `router/` workspace. New agent follows established pattern with dedicated subdirectory under `agents/` for complex multi-file implementation.

## Complexity Tracking

> No constitution violations requiring justification. Implementation follows established agent patterns.

| Aspect           | Approach                | Rationale                                               |
| ---------------- | ----------------------- | ------------------------------------------------------- |
| AST Parsing      | TypeScript Compiler API | Native TS support, type information, no external binary |
| CFG Construction | Custom implementation   | Tailored to mitigation tracking needs                   |
| Pattern Matching | Declarative JSON config | Allows custom patterns per FR-014                       |
| Inter-procedural | Bounded depth traversal | Prevents unbounded recursion per FR-003                 |

---

## Post-Design Constitution Re-Check

_Re-evaluated after Phase 1 design completion._

| Principle                            | Status  | Post-Design Notes                                                                                             |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------- |
| **I. Router Owns All Posting**       | ✅ PASS | `ControlFlowFinding` schema integrates with existing router dedup; agent returns `Finding[]` only             |
| **II. Structured Findings Contract** | ✅ PASS | `ControlFlowFindingSchema` in contracts validates all fields; extends base Finding with metadata              |
| **III. Provider-Neutral Core**       | ✅ PASS | No provider-specific code in data model or contracts                                                          |
| **IV. Security-First Design**        | ✅ PASS | AST parsing treats all code as untrusted; no file system writes; Zod validates all config input               |
| **V. Deterministic Outputs**         | ✅ PASS | Fingerprint algorithm is content-based; no timestamps/random; budget produces same degradation for same input |
| **VI. Bounded Resources**            | ✅ PASS | `AnalysisBudget` entity enforces limits; degradation strategy documented in research.md                       |
| **VII. Environment Discipline**      | ✅ PASS | TypeScript API is pure JS; no subprocess spawning; pinned dependency                                          |
| **VIII. Explicit Non-Goals**         | ✅ PASS | Scope limited to TypeScript/JavaScript V1; explicit out-of-scope items documented                             |

**Quality Gate Compliance**:

- Type contracts use Zod with strict validation
- All schemas exportable for test assertions
- No circular imports in contract file
- Configuration schema supports validation at load time (FR-016)

---

## Generated Artifacts

| Artifact   | Path                                                              | Description                       |
| ---------- | ----------------------------------------------------------------- | --------------------------------- |
| Plan       | `specs/001-control-flow-analysis/plan.md`                         | This implementation plan          |
| Research   | `specs/001-control-flow-analysis/research.md`                     | Technology decisions              |
| Data Model | `specs/001-control-flow-analysis/data-model.md`                   | Entity definitions                |
| Contracts  | `specs/001-control-flow-analysis/contracts/control-flow-types.ts` | Type definitions with Zod schemas |
| Quickstart | `specs/001-control-flow-analysis/quickstart.md`                   | Developer guide                   |

## Next Steps

Run `/speckit.tasks` to generate implementation tasks from this plan.
