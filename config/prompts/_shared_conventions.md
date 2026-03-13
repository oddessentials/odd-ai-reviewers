<!-- Shared conventions for all review prompts -->
<!-- Source of truth: config/prompts/_shared_conventions.md -->
<!-- Synced to prompt files by: scripts/sync-prompt-conventions.ts -->
<!-- Do NOT edit the content between BEGIN/END SHARED CONVENTIONS markers in prompt files directly -->

### Additional Data-flow Verification Rules

- Binary response bodies (audio, images, ArrayBuffer, Buffer) sent with non-HTML content-type are NOT XSS vectors — do not flag
- Zod-validated inputs after `.parse()` are type-safe — do not flag unless the Zod schema itself is permissive (e.g., `z.string()` on user-facing HTML output)

7. **Existence verification before reporting**: Before reporting ANY finding:
   - Verify the specific code construct you reference EXISTS in the diff at the line you cite
   - Do NOT claim code "lacks documentation" without checking surrounding context
   - Do NOT claim values are incorrect without evidence of a mismatch
   - Do NOT flag ordering issues unless check and action are in the SAME subsystem
   - When analyzing caching/deduplication (singleflight, memoization), examine the FULL key
   - If you cannot find the exact construct in the diff, OMIT the finding

8. **TypeScript type-system trust**: Do NOT suggest runtime type validation for values
   constrained by TypeScript's type system (union types, enums, branded types, `as const`).
   - DO NOT flag: Missing runtime check for `'low' | 'medium' | 'high'` parameter
   - DO NOT flag: Missing assertion for Zod `.parse()` output
   - DO flag: Unvalidated `string` from user input used as an enum key

9. **No business-decision findings**: Do NOT flag budget amounts, pricing values,
   resource limits, timeout durations, or retry counts as code quality issues unless
   they cause a functional bug.

10. **No cosmetic refactoring suggestions**: Do NOT suggest:
    - Splitting orchestrator components unless specific extractable logic is identified
      AND the PR is about refactoring
    - Optimizing init-time code unless profiling shows a bottleneck
    - Adding comments to code where variable names make intent clear
    - Extracting expressions matching a consistent file-wide pattern
    - Expanding minified code (GLSL, inlined SQL) unless the PR is about readability

11. **Developer tooling files**: Do NOT flag shell commands in .husky/, Makefiles,
    scripts/, or CI configuration as injection risks unless arguments demonstrably
    come from user-controlled environment variables or external input.

12. **React useRef pattern**: `useRef<T>(null)` with type assertions or non-null
    assertions on `.current` is standard React 18+ TypeScript. Do NOT flag
    `ref.current!` or `as T` on ref values as unsafe.

### Active Context Directives

Before generating any findings:

1. **MANDATORY: Check Project Rules** (if present above):
   - Read ALL project rules FIRST, before any code analysis
   - HARD CONSTRAINT: Do NOT generate ANY finding that contradicts a documented project decision
   - If a project rule mandates a specific structure, do NOT suggest alternatives
   - Check project constitution and brand guidelines before flagging hardcoded values
   - Do NOT suggest "extract for testability" when no test framework exists

2. **MANDATORY: Check PR Description** (if present above):
   - Read the PR title and description to understand the author's stated intent
   - Do NOT flag the exact behavior described in the PR purpose
   - If a PR describes conditional/environment-dependent behavior, do NOT flag it
   - If the PR description explains WHY, do NOT question that reasoning

3. **Design intent awareness**:
   - Before flagging resource leaks, verify whether intentional consumption is part of the design
   - Before flagging undefined fields in cache keys, check if absence is a discriminator
   - Before flagging instanceof checks, consider singleton architecture guarantees
