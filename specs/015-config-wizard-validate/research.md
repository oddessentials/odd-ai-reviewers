# Research: 015-config-wizard-validate

**Date**: 2026-01-31
**Purpose**: Resolve technical decisions for interactive wizard and validation command

## R1: Interactive Prompt Library Selection

**Decision**: Use Node.js built-in `readline` module with `readline/promises` API

**Rationale**:

- No new dependencies required (Constitution VII compliance)
- `readline/promises` provides async/await interface (Node.js 17+)
- Sufficient for simple single-select and multi-select prompts
- Stable API, well-documented, works on all platforms

**Alternatives Considered**:

| Option                | Pros                          | Cons                                |
| --------------------- | ----------------------------- | ----------------------------------- |
| `@inquirer/prompts`   | Rich UI, arrow key navigation | New dependency, 50+ transitive deps |
| `prompts`             | Simple API                    | New dependency                      |
| `readline` (built-in) | Zero deps, stable             | Manual arrow key handling           |
| Raw `process.stdin`   | Maximum control               | Complex, error-prone                |

**Implementation Approach**:

- Use numbered choices (1, 2, 3...) instead of arrow key navigation
- Simpler to implement, works in all terminal emulators
- Users type number and press Enter

## R2: Exit Code Semantics

**Decision**: Follow Unix convention with clear separation of error types

| Condition                  | Exit Code | Rationale                  |
| -------------------------- | --------- | -------------------------- |
| Success                    | 0         | Standard success           |
| Validation error (any)     | 1         | Errors are failures        |
| Validation warnings only   | 0         | Warnings are informational |
| User cancellation (Ctrl+C) | 0         | Intentional user choice    |
| Config file not found      | 1         | Required input missing     |
| Invalid YAML syntax        | 1         | Parsing failure            |

**Rationale**:

- Errors indicate problems requiring user action before proceeding
- Warnings are informational; CI should proceed but user should review
- User cancellation is not a failure (per spec clarification)

## R3: Validation Report Structure

**Decision**: Use three-tier severity classification

```typescript
interface ValidationReport {
  errors: string[]; // Block execution, exit 1
  warnings: string[]; // Log to stderr, exit 0
  info: string[]; // Log to stdout, exit 0
  resolved?: ResolvedConfigTuple; // On success
}
```

**Output Format**:

```
✗ ERROR: <message>
  Fix: <actionable instruction>

⚠ WARNING: <message>
  Note: <context>

✓ Configuration valid
  Provider: openai
  Model: gpt-4o
  Key source: env:OPENAI_API_KEY
  Config source: file
```

**Rationale**: Matches existing preflight error format; adds severity prefixes for clarity.

## R4: Wizard State Machine

**Decision**: Linear flow with early exit on cancellation

```
START → Platform Selection → Provider Selection → Agent Selection → Confirm → Write File → Validate → END
         ↓                    ↓                    ↓                 ↓
         (cancel)            (cancel)             (cancel)          (cancel)
         ↓                    ↓                    ↓                 ↓
         EXIT(0)             EXIT(0)              EXIT(0)           EXIT(0)
```

**State Tracking**:

```typescript
interface WizardState {
  platform: 'github' | 'azure-devops' | 'both' | null;
  provider: LlmProvider | null;
  agents: string[];
  outputPath: string;
}
```

**Rationale**: Simple linear flow sufficient for 3-step wizard. No need for complex state machine with backtracking - users can restart if they make wrong choices.

## R5: Byte-Stable YAML Generation

**Decision**: Reuse existing `generateConfigYaml()` which already has deterministic key ordering

**Verification**:

- `router/src/cli/config-wizard.ts` lines 155-212 already enforce stable key order
- Key order: version → provider → trusted_only → triggers → passes → limits → models → reporting → gating
- No timestamps or dynamic content in generated YAML
- Lists use consistent ordering (static agents before AI agents)

**Additional Requirement**: Ensure agent list ordering is alphabetical within categories for full byte-stability.

## R6: Overwrite Confirmation Prompt

**Decision**: Simple Y/N prompt before overwriting existing file

```
File .ai-review.yml already exists. Overwrite? [y/N]:
```

- Default: No (capital N)
- Accept: y, Y, yes, Yes
- Reject: n, N, no, No, Enter (empty)
- Invalid input: Re-prompt

**Rationale**: Standard Unix convention for destructive operations.

## R7: Integration with Existing Preflight

**Decision**: Call `runPreflightChecks()` directly from validate command

**Current Code** (main.ts lines 85-97):

```typescript
program.command('validate').action(async (options) => {
  const config = await loadConfig(options.repo);
  console.log(JSON.stringify(config, null, 2));
});
```

**Updated Code**:

```typescript
program.command('validate').action(async (options, cmd) => {
  const config = await loadConfig(options.repo);
  const result = runPreflightChecks(config);
  printValidationReport(result);
  exitHandler(result.valid ? 0 : 1);
});
```

**Rationale**: Reuses all existing validation logic without duplication.

## R8: Testing Strategy

**Decision**: Use Vitest with stdin mocking for interactive tests

**Approach**:

1. Mock `process.stdin` for automated testing
2. Inject `readline.Interface` instance for testability
3. Test each prompt function in isolation
4. Integration tests with full wizard flow using mock streams

**Example**:

```typescript
it('should prompt for platform selection', async () => {
  const mockInput = createMockReadline(['1']); // Select option 1
  const result = await promptPlatform(mockInput);
  expect(result).toBe('github');
});
```

## Summary of Decisions

| Area           | Decision                        | Justification           |
| -------------- | ------------------------------- | ----------------------- |
| Prompt library | Node.js `readline`              | Zero dependencies       |
| Prompt style   | Numbered choices                | Works everywhere        |
| Exit codes     | Error=1, Warning=0, Cancel=0    | Unix convention         |
| Report format  | Three-tier (error/warning/info) | Clear severity          |
| Wizard flow    | Linear, no backtracking         | Simplicity              |
| YAML stability | Reuse existing + sort lists     | Already implemented     |
| Validation     | Call `runPreflightChecks()`     | No duplication          |
| Testing        | Vitest + stdin mock             | Existing infrastructure |

All NEEDS CLARIFICATION items resolved. Ready for Phase 1: Design & Contracts.
