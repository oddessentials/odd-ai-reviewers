# Implementation Plan: User-Friendly Configuration & API Key Handling

**Branch**: `014-user-friendly-config` | **Date**: 2026-01-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-user-friendly-config/spec.md`

## Summary

Enhance the configuration system to be more user-friendly by adding explicit provider selection, improving error messages with actionable fixes, implementing resolved config logging for reproducibility, and adding a guided configuration wizard. This includes a breaking change: multi-key + MODEL without explicit `provider` now fails instead of using implicit precedence.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: Zod 4.x (schema validation), Commander 14.x (CLI), Vitest 4.x (testing)
**Storage**: N/A (file-based `.ai-review.yml` only)
**Testing**: Vitest with existing patterns from `router/src/__tests__/`
**Target Platform**: Node.js >=22.0.0 (Linux CI, Windows/Mac dev)
**Project Type**: Single project (router package)
**Performance Goals**: Preflight trivially fast (no explicit target per spec clarification)
**Constraints**: Must maintain backward compatibility for valid single-provider configs
**Scale/Scope**: Existing codebase enhancement, ~500-800 lines new/modified code

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status | Notes                                                  |
| -------------------------------- | ------ | ------------------------------------------------------ |
| I. Router Owns All Posting       | PASS   | No changes to posting - only config/preflight          |
| II. Structured Findings Contract | PASS   | No changes to findings schema                          |
| III. Provider-Neutral Core       | PASS   | Adding explicit provider selection enhances neutrality |
| IV. Security-First Design        | PASS   | No secret exposure changes; API keys remain env-only   |
| V. Deterministic Outputs         | PASS   | FR-011 (resolved config logging) enhances determinism  |
| VI. Bounded Resources            | PASS   | No changes to limits                                   |
| VII. Environment Discipline      | PASS   | No runtime installers; env var handling unchanged      |
| VIII. Explicit Non-Goals         | PASS   | No CI orchestration; stays within scope                |

**Quality Gates**:

- Zero-Tolerance Lint: Will enforce with `--max-warnings 0`
- Security Linting: No new child process or eval usage
- Dependency Architecture: No new circular dependencies
- Local = CI Parity: Pre-commit hooks will run on new code

**Verification Requirements**:

- All new validations must have unit tests
- Breaking change documented in CHANGELOG
- Documentation updated for provider field

## Project Structure

### Documentation (this feature)

```text
specs/014-user-friendly-config/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - no API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
router/src/
├── config/
│   ├── schemas.ts           # MODIFY: Add provider field to ConfigSchema
│   └── providers.ts         # MODIFY: Update resolveProvider for explicit provider
├── preflight.ts             # MODIFY: Add multi-key validation, resolved config logging
├── phases/preflight.ts      # MODIFY: Add logging call after validation
├── main.ts                  # MODIFY: Add config wizard command
├── cli/
│   └── config-wizard.ts     # NEW: Interactive configuration wizard
└── __tests__/
    ├── preflight.test.ts    # MODIFY: Add multi-key + MODEL tests
    └── config-wizard.test.ts # NEW: Wizard tests

docs/
├── configuration/
│   ├── quickstart.md        # MODIFY: Add provider examples
│   └── troubleshooting.md   # NEW: Error resolution guide
└── getting-started/
    └── first-setup.md       # MODIFY: Simplify for single-provider path
```

**Structure Decision**: Single project (router package). All changes are within the existing `router/src/` structure with additions to CLI and preflight validation.

## Complexity Tracking

No constitution violations requiring justification. All changes align with existing patterns:

- Schema extension follows existing Zod patterns
- Preflight validation follows collect-all-errors pattern
- CLI follows Commander patterns from existing commands

---

## Constitution Re-Check (Post Phase 1 Design)

| Principle                        | Status | Design Verification                                   |
| -------------------------------- | ------ | ----------------------------------------------------- |
| I. Router Owns All Posting       | PASS   | Config wizard writes files only; no API posting       |
| II. Structured Findings Contract | PASS   | ResolvedConfigTuple is internal logging, not findings |
| III. Provider-Neutral Core       | PASS   | Explicit provider selection maintains neutrality      |
| IV. Security-First Design        | PASS   | keySource logs env var name, never the value          |
| V. Deterministic Outputs         | PASS   | Resolved config logging ensures reproducibility       |
| VI. Bounded Resources            | PASS   | No resource limit changes                             |
| VII. Environment Discipline      | PASS   | readline is built-in, no new runtime deps             |
| VIII. Explicit Non-Goals         | PASS   | Wizard is CLI tool, not CI orchestration              |

**Post-Design Quality Gate Verification**:

- [x] New types (`ResolvedConfigTuple`, `ProviderSchema`) will have unit tests
- [x] Breaking change (multi-key + MODEL) documented in data-model.md
- [x] No circular dependencies introduced (cli/config-wizard.ts is leaf module)

---

## Generated Artifacts

| Artifact   | Path                                           | Status   |
| ---------- | ---------------------------------------------- | -------- |
| Research   | `specs/014-user-friendly-config/research.md`   | Complete |
| Data Model | `specs/014-user-friendly-config/data-model.md` | Complete |
| Quickstart | `specs/014-user-friendly-config/quickstart.md` | Complete |
| Contracts  | N/A (no API contracts for this feature)        | N/A      |

---

## Next Steps

Run `/speckit.tasks` to generate the implementation task list from this plan.
