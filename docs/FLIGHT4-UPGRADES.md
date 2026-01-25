# Flight 4: Major Version Upgrades

> **Status**: Planning Complete — Awaiting Dedicated Testing Window

This document tracks the deferred major version upgrades that require dedicated testing due to breaking API changes.

---

## Overview

| Package | Current | Target | Complexity | Status     |
| ------- | ------- | ------ | ---------- | ---------- |
| vitest  | 2.1.8   | 4.x    | Low        | 🟡 Planned |
| openai  | 4.77.0  | 6.x    | Medium     | 🟡 Planned |
| zod     | 3.24.1  | 4.x    | Low-Medium | 🟡 Planned |

---

## Vitest 2→4 Migration

### Breaking Changes

| Change                                                                                       | Impact | Action Required                    |
| -------------------------------------------------------------------------------------------- | ------ | ---------------------------------- |
| Test signature `it(name, fn, options)` removed                                               | Low    | Migrate to `it(name, options, fn)` |
| Coverage options removed: `coverage.all`, `coverage.extensions`, `coverage.ignoreEmptyLines` | Low    | Remove if present                  |
| V8 coverage uses AST-based remapping                                                         | None   | Expect slight coverage % shifts    |
| `poolMatchGlobs` and `environmentMatchGlobs` removed                                         | None   | Use `projects` if needed           |

### Current State Assessment

- **Test files**: 29
- **Total tests**: 533+
- **Deprecated patterns detected**: None
- **Migration complexity**: Low

### Migration Steps

1. Update `router/package.json`: `"vitest": "^4.0.0"`
2. Run `npm install`
3. Run full test suite: `npm test`
4. Review any coverage configuration in `vitest.config.ts` (if exists)
5. Address any test signature deprecation warnings

### Rollback Procedure

```bash
git checkout HEAD -- router/package.json package-lock.json
npm install
npm test
```

---

## OpenAI 4→6 Migration

### Breaking Changes

| Change                                                   | Impact | Action Required                       |
| -------------------------------------------------------- | ------ | ------------------------------------- |
| `ResponseFunctionToolCallOutputItem.output` type changed | Medium | Update type handling for tool outputs |
| Error class hierarchy updates                            | Medium | Verify error handling in `retry.ts`   |

### Current State Assessment

**Files using OpenAI SDK:**

- `router/src/agents/opencode.ts`
- `router/src/agents/pr_agent.ts`
- `router/src/agents/ai_semantic_review.ts`
- `router/src/agents/retry.ts` (error class handling)
- `router/src/__tests__/retry.test.ts`
- `router/src/__tests__/pr_agent_retry.test.ts`

**Critical dependency**: `retry.ts` uses OpenAI error classes:

- `OpenAI.RateLimitError`
- `OpenAI.InternalServerError`
- `OpenAI.APIConnectionError`
- `OpenAI.APIError`
- `OpenAI.AuthenticationError`
- `OpenAI.BadRequestError`
- `OpenAI.NotFoundError`
- `OpenAI.PermissionDeniedError`

### Migration Steps

1. Update `router/package.json`: `"openai": "^6.0.0"`
2. Run `npm install`
3. Run TypeScript check: `npm run typecheck`
4. Fix any type errors in agent files
5. Verify error class handling in `retry.ts` still works
6. Run retry-specific tests: `npm test -- retry`
7. Run full test suite

### Rollback Procedure

```bash
git checkout HEAD -- router/package.json package-lock.json
npm install
npm test
```

---

## Zod 3→4 Migration

### Breaking Changes

| Change                                          | Impact | Action Required                        |
| ----------------------------------------------- | ------ | -------------------------------------- |
| Error customization unified under `error` param | None   | `message` deprecated but functional    |
| `z.string().email()` → `z.email()`              | None   | Method forms deprecated but functional |
| `z.strict()` → `z.strictObject()`               | None   | Not used in codebase                   |
| `z.nativeEnum()` deprecated                     | None   | Not used in codebase                   |
| `z.number().safe()` = `.int()`                  | None   | Not used in codebase                   |
| `z.default()` short-circuits on undefined       | Low    | Review default behavior                |

### Current State Assessment

**Files using Zod:**

- `router/src/config/schemas.ts` (108 lines, primary usage)
- `router/src/agents/pr_agent.ts`
- `router/src/agents/opencode.ts`
- `router/src/agents/ai_semantic_review.ts`

**Patterns in use:**

- `z.enum([...])` ✅ Compatible
- `z.object({...})` ✅ Compatible
- `z.number().default(n)` ⚠️ Review default behavior
- `z.string().optional()` ✅ Compatible
- `z.boolean().default(b)` ⚠️ Review default behavior
- `z.array(schema)` ✅ Compatible

### Migration Steps

1. Update `router/package.json`: `"zod": "^4.0.0"`
2. Run `npm install`
3. Run TypeScript check: `npm run typecheck`
4. Review `z.default()` usage for any behavioral changes
5. Run config-specific tests: `npm test -- config`
6. Run full test suite

### Rollback Procedure

```bash
git checkout HEAD -- router/package.json package-lock.json
npm install
npm test
```

---

## Testing Strategy

### Pre-Upgrade Baseline

Before any upgrade, capture baseline:

```bash
npm run verify
npm test -- --reporter=json --outputFile=baseline-results.json
```

### Upgrade Order

Recommended order (lowest risk first):

1. **Vitest** — Tooling only, no runtime impact
2. **Zod** — Schema validation, well-tested
3. **OpenAI** — API client, requires most testing

### Post-Upgrade Validation

After each upgrade:

```bash
npm run verify           # Full quality gates
npm test                 # All tests pass
npm run depcruise       # No new circular dependencies
```

---

## Schedule

These upgrades are scheduled for a dedicated testing window after Flight 4 completion.

**Prerequisites:**

- [ ] All Flight 4 changes committed and merged
- [ ] CI green on main branch
- [ ] Dedicated time for testing and potential rollback

**Execution:**

- [ ] Create feature branch: `chore/major-upgrades-flight5`
- [ ] Apply upgrades one at a time
- [ ] Full test cycle after each upgrade
- [ ] PR review with comprehensive test evidence
