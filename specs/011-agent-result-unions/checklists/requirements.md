# Specification Quality Checklist: AgentResult Discriminated Unions

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-01-29
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Clarification Analysis

The `/speckit.clarify` input identified several additional gaps. Analysis:

| Gap                       | Already Done in 010               | Action                     |
| ------------------------- | --------------------------------- | -------------------------- |
| npm bin shim test         | Partial (isMainModule exists)     | → 012                      |
| child_process audit       | Not done                          | → 012                      |
| ErrorWireFormat contract  | ✅ Done (types/errors.ts)         | Add round-trip tests → 012 |
| Generic Error elimination | Not done (11 remain)              | → 012                      |
| Result<T,E> at boundaries | ✅ Done (config, git-validators)  | Complete                   |
| Filesystem path hardening | ✅ Secure (no unsafe usage found) | Complete                   |
| SafeGitRef enforcement    | ✅ Done (consistent usage)        | Complete                   |
| Validate before brand     | ✅ Done (SafeGitRefHelpers)       | Complete                   |
| CLI import-safe           | ✅ Done (isMainModule guard)      | Complete                   |
| Canary tests              | Partial (depcruise-rules.test.ts) | → 012                      |

**Recommendation**: Keep 011 focused on AgentResult discriminated unions. Create 012-security-hardening for:

- npm bin shim CI test
- child_process audit and documentation
- Generic Error → domain-specific Error migration
- ErrorWireFormat round-trip tests
- Extended canary tests
- ESLint rule for generic Error prevention

## Notes

- Specification is complete and ready for `/speckit.plan`
- This feature completes 010-type-test-optimization Phase 9 + partial Phase 10
- 13 production files will need migration (7 agents + 6 consumers) - recommend incremental approach in planning
- User Story 3 (Typed Metadata) upgraded to P1 - ships with discriminated unions
- Security hardening items split to 012 to maintain focused scope
- **Process directive added**: Each phase must be committed after CI/quality checks pass; fix any failures (pre-existing or new) before proceeding

## Latest Clarification Session (2026-01-29 - Session 2)

Additional enforcement requirements integrated:

1. **`.success` ban timing**: Unconditional after Phase 1 (not Phase 4); allowlist only CLI entry + temp migration file
2. **Canary test approach**: Runtime/tsd-style (`satisfies` + exhaustive switch), no intentional compile errors in CI
3. **Serialization contract**: Required (`toJSON/fromJSON` or Zod) + round-trip tests even though "not persisted"
4. **Constructor locking**: ESLint/grep check forbids `status: 'success'` literals outside `agents/types.ts`
5. **partialFindings exclusion**: Day 1 enforcement; integration test proves no success metric increment
6. **Metadata helpers isolation**: `agents/metadata.ts` with zero back-edges to agent implementations
