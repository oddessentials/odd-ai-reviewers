# Implementation Plan: Complete Config Wizard and Validation Command

**Branch**: `015-config-wizard-validate` | **Date**: 2026-01-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-config-wizard-validate/spec.md`

## Summary

This feature completes the remaining work from 014-user-friendly-config:

1. **Interactive Configuration Wizard** - Add interactive prompts to `config init` command using Node.js readline for platform, provider, and agent selection
2. **Comprehensive Validation Command** - Integrate `runPreflightChecks()` into the `validate` command so it catches all configuration issues, not just YAML schema errors
3. **Post-Wizard Validation Summary** - Display validation results after wizard generates config file

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: Commander 14.x (CLI), yaml 2.x (YAML generation), Zod 4.x (schema validation), Node.js readline (interactive prompts - built-in, no new deps)
**Storage**: N/A (file-based `.ai-review.yml` only)
**Testing**: Vitest 4.x
**Target Platform**: Node.js >=22.0.0, Linux/macOS/Windows
**Project Type**: Single (CLI tool)
**Performance Goals**: Wizard completes in <2 minutes for first-time users (per SC-001)
**Constraints**: Byte-stable YAML output (FR-014), TTY required for interactive mode
**Scale/Scope**: 4 providers, 6 agents, 2 platforms - small fixed option sets

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Notes                                                                                    |
| -------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ N/A  | No posting involved - config generation only                                             |
| II. Structured Findings Contract | ✅ N/A  | No findings - config/validation output                                                   |
| III. Provider-Neutral Core       | ✅ Pass | Wizard supports all 4 providers equally                                                  |
| IV. Security-First Design        | ✅ Pass | No secrets in wizard output; validation warns about missing keys but doesn't expose them |
| V. Deterministic Outputs         | ✅ Pass | FR-014 enforces byte-stable YAML (stable key order, no timestamps)                       |
| VI. Bounded Resources            | ✅ N/A  | No resource-intensive operations                                                         |
| VII. Environment Discipline      | ✅ Pass | Uses built-in Node.js readline, no curl\|bash                                            |
| VIII. Explicit Non-Goals         | ✅ Pass | Remains CLI tool, no servers/daemons                                                     |

**Pre-Design Gate Status**: PASS - No violations requiring justification.

### Post-Design Re-Check

_After Phase 1 design completion (2026-01-31)_

| Principle                        | Status  | Design Verification                                             |
| -------------------------------- | ------- | --------------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ N/A  | Design confirms no posting - only local file I/O                |
| II. Structured Findings Contract | ✅ N/A  | ValidationReport is internal CLI output, not agent findings     |
| III. Provider-Neutral Core       | ✅ Pass | AVAILABLE_PROVIDERS array treats all 4 providers equally        |
| IV. Security-First Design        | ✅ Pass | keySource shows "env:VAR_NAME", never actual secret values      |
| V. Deterministic Outputs         | ✅ Pass | research.md R5 confirms existing YAML generation is byte-stable |
| VI. Bounded Resources            | ✅ N/A  | No loops, no network calls, no unbounded operations             |
| VII. Environment Discipline      | ✅ Pass | Node.js readline is built-in, no external dependencies added    |
| VIII. Explicit Non-Goals         | ✅ Pass | No servers, no daemons, pure CLI interaction                    |

**Post-Design Gate Status**: PASS - Design is constitution-compliant.

## Project Structure

### Documentation (this feature)

```text
specs/015-config-wizard-validate/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
router/src/
├── cli/
│   ├── config-wizard.ts     # Existing - extend with interactive prompts
│   ├── interactive-prompts.ts  # NEW - readline-based prompt utilities
│   └── validation-report.ts    # NEW - validation result formatting
├── main.ts                  # Existing - update validate command
└── phases/
    └── preflight.ts         # Existing - reuse runPreflightChecks()

router/src/__tests__/
├── config-wizard.test.ts    # Existing - extend with interactive tests
├── interactive-prompts.test.ts  # NEW - prompt utility tests
└── validation-report.test.ts    # NEW - report formatting tests
```

**Structure Decision**: Extends existing single-project structure. New modules are small, focused utilities that integrate with existing CLI infrastructure.

## Complexity Tracking

> No violations to justify - all gates pass.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| N/A       | N/A        | N/A                                  |

## Generated Artifacts

| Artifact     | Path                                                       | Purpose                              |
| ------------ | ---------------------------------------------------------- | ------------------------------------ |
| Research     | [research.md](./research.md)                               | Technical decisions and alternatives |
| Data Model   | [data-model.md](./data-model.md)                           | Entity definitions and relationships |
| CLI Contract | [contracts/cli-interface.md](./contracts/cli-interface.md) | Command signatures and behaviors     |
| Quickstart   | [quickstart.md](./quickstart.md)                           | Developer implementation guide       |

## Next Steps

1. Run `/speckit.tasks` to generate task breakdown
2. Implement tasks in dependency order
3. Run tests after each task completion
4. Update spec status to "Complete" when all tasks done
