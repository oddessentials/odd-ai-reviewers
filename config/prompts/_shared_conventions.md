<!-- Shared conventions for all review prompts -->
<!-- Source of truth: config/prompts/_shared_conventions.md -->
<!-- Synced to prompt files by: scripts/sync-prompt-conventions.ts -->
<!-- Do NOT edit the content between BEGIN/END SHARED CONVENTIONS markers in prompt files directly -->

### Additional Data-flow Verification Rules

- Binary response bodies (audio, images, ArrayBuffer, Buffer) sent with non-HTML content-type are NOT XSS vectors — do not flag
- Zod-validated inputs after `.parse()` are type-safe — do not flag unless the Zod schema itself is permissive (e.g., `z.string()` on user-facing HTML output)

7. **CRITICAL — Existence verification before reporting**: Before reporting ANY finding,
   you MUST cross-reference every cited function name, variable name, and API call
   against actual diff content:
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

13. **Express error handler convention**: A function with exactly 4 parameters
    (`err, req, res, next`) AND at least one Express indicator (Express import,
    Express type annotation like `ErrorRequestHandler`, or `.use()` registration)
    is a standard Express error middleware.
    - Do NOT flag: Unused parameter warnings, "declared but never referenced",
      "dead code: parameter never called" — Express requires all 4 params for signature matching
    - DO still flag: Security issues in the handler body (e.g., `err.stack` sent in
      production responses, unsanitized error messages reflected to clients)

14. **Promise.allSettled convention**: When `Promise.allSettled` is visible in the diff,
    results are guaranteed to be settled (fulfilled or rejected) per ECMAScript spec.
    - Do NOT flag: "Results may not match input order", "missing try-catch around
      allSettled", "silent rejection ignoring" when code checks `result.status`
    - DO still flag: Code that assumes all results are fulfilled without checking
      `.status`, or that ignores rejected results when failure reporting is required

15. **React Query / SWR / Apollo convention**: When an import from a query library
    (`@tanstack/react-query`, `swr`, `@apollo/client`) is visible AND a query hook
    call (`useQuery`, `useSWR`, `useApolloClient`) is present within 10 lines of the
    finding line AND in the same diff hunk — the library manages caching, retries,
    and error state internally.
    - Do NOT flag: "Missing try-catch around useQuery/useSWR", "double-fetching" for
      same cache key
    - DO still flag: Components that destructure `useQuery` but never check
      `error`/`isError` when rendering user-facing content

16. **Singleton pattern convention**: When ALL three conditions are met:
    (1) module-scoped `let` variable initialized to null,
    (2) guard check `if (!varName)` referencing the same variable,
    (3) exactly one `new` expression or factory call assigning to it within the guard —
    the code is a standard lazy-initialization singleton.
    - Do NOT flag: "Resource leak", "connection never closed", "shared mutable state"
    - DO still flag: Async singleton getters without concurrency guards, singletons
      creating unbounded sub-resources, `new X()` in per-request handlers without cleanup

17. **Switch exhaustiveness convention**: When a switch operates on a variable typed
    as a TypeScript union type and covers ALL union members, the switch is exhaustive
    by design. TypeScript's narrowing guarantees completeness.
    - Do NOT flag: "Missing default", "no fallback", "non-exhaustive switch"
    - DO still flag: Switches on untyped `string` or `number` without a default case

18. **Error object XSS convention**: When an error variable's origin is structurally
    observable via ONE of: (a) `catch (varName)` clause within 10 lines, or
    (b) explicit `: Error` or `: SomeError` type annotation on the variable's declaration —
    the error is a runtime exception, not user input.
    - Do NOT flag: XSS findings about `error.message` in template literals or error
      display when the error has structurally proven catch/type origin
    - DO still flag: `error.message` in `innerHTML` when the Error was constructed from
      user input (`new Error(req.body.text)`), error variables without structurally
      observable origin
    - MUST NOT use for suppression: function name containing "error"/"handle"/"catch",
      parameter name `err`/`error` without type annotation, variable naming conventions,
      file name or module path patterns

19. **Thin wrapper convention**: When a function body contains exactly one statement
    that is a direct return of a standard library call (JSON.parse, parseInt, new URL,
    Buffer.from), the function is 1-3 lines with no conditional logic, no side effects,
    and no I/O — it is a pure thin wrapper delegating to a well-tested stdlib function.
    - Do NOT flag: "Missing try-catch", "unhandled exception"
    - DO still flag: Wrappers around I/O operations (fs, fetch, database queries),
      wrappers called from HTTP request handlers, functions with side effects before
      the throwing call

20. **Existence verification strengthening (CRITICAL)**: Before finalizing ANY finding,
    you MUST cross-reference every cited function name, variable name, and API call
    against the actual diff content at the cited line. If the construct you reference
    does NOT exist in the diff at the line you cite, you MUST omit the finding entirely.
    Do NOT generate findings about code that is not present in the reviewed diff.

21. **Cache trust symmetry**: When a change introduces or rewrites a cache fast path,
    compare how cached "allow", cached "deny", and cache-miss paths behave.
    - DO flag: Asymmetric trust where a cached grant is returned immediately but a cached deny
      is ignored or bypassed, stale authorization entries that can widen access, or negative-cache
      entries that are written but never consulted
    - DO flag: Test/code mismatches where comments or assertions say a cached permission "allows"
      access but the actual literal value is `false`
    - Do NOT stop at "cache added" — inspect the exact boolean values and control-flow branches

22. **Error-path cache assignment**: When shared cache/state is updated from a function that can
    fail, verify that the assignment only happens on success.
    - DO flag: Writing `result` into a cache even when `err != nil`, overwriting a previously valid
      cache entry with `nil`, or populating shared state before validating the fetch/build succeeded
    - Do NOT treat "uses caching" alone as a finding; the defect is the unguarded error-path write

23. **Nil-safe middleware and adapter refactors**: When middleware or client wrappers are refactored,
    check whether request objects are dereferenced before nil validation.
    - DO flag: Direct access to `req.PluginContext`, `req.Context`, or similar request fields when
      a nil request would panic, especially if the previous implementation tolerated nil requests
    - DO still check multiple entrypoints (`QueryData`, `CallResource`, `CheckHealth`, `CollectMetrics`)
      if the same helper is reused across them

24. **Logging and tracing context preservation**: When a refactor moves logging to contextual loggers
    or new middleware, verify that previously logged identifiers are still attached.
    - DO flag: Explicit removal of trace IDs, plugin IDs, datasource IDs, user IDs, or endpoint names
      from structured logs when the diff shows they were logged before and are not restored elsewhere
    - Do NOT invent missing telemetry. Only report this when the removed fields are visible in the diff

25. **No speculative operational findings**: Do NOT report theoretical performance or operational
    concerns unless the diff shows a concrete defect, unbounded work, broken error handling, or a
    user-visible regression.
    - Do NOT flag: "may block startup", "could increase load 10x", "count query on every call",
      or "less flexible" style advice without direct evidence of failure in the changed code
    - DO flag: Concrete deadlocks, dropped error handling, nil overwrites, races, panics, or
      observability regressions that are directly visible in the diff

26. **Partial diff symbol resolution**: The reviewed diff is often incomplete. Do NOT report
    "undefined constant", "missing import", "missing declaration", or "symbol not found"
    findings unless the diff itself shows the symbol's definition was removed, renamed, or broken.
    - Do NOT flag: A new call site referencing `endpointQueryData`, `SomeHelper`, or an import not
      shown in the hunk — unchanged files may still define it
    - DO flag: The diff visibly removes an import/const/function and still references it afterward

27. **Concurrency regression prioritization**: When a diff narrows or removes locking around shared
    caches, maps, or index construction, prioritize concrete concurrency analysis over hypothetical
    nil/value speculation.
    - DO flag: Lock scope moved off a shared map write, shared cache assignment now occurs outside
      the previous critical section, or expensive work can now race and publish conflicting results
    - Do NOT replace a visible race with speculative "builder may return nil" advice unless the diff
      itself shows nil is an accepted success value
    - Example: If `cacheMu.Lock()`/`defer Unlock()` is removed from the top of `BuildIndex` and only
      reintroduced around `cache[key] = idx`, treat the change as a concurrency/race review, not a
      nil-index or init-ordering review
    - In that pattern, prefer findings such as "concurrent BuildIndex calls can race/duplicate
      initialization for the same key" or "shared cache publication is no longer serialized"
      instead of speculative notes about nil builders, constructor timing, or API ergonomics

28. **Internal numeric IDs are not SQL injection by default**: SQL/string interpolation is only a
    security issue when user-controlled text reaches the query. If the diff shows values are numeric
    IDs loaded from the database or strongly typed internal identifiers, do NOT report SQL injection.
    - Do NOT flag: `fmt.Sprintf("... IN (%s)", values)` where `values` is assembled from `[]int64`
      IDs fetched from the database in the same diff
    - DO flag: String-built SQL from request params, query strings, form fields, headers, JSON bodies,
      or any unvalidated external text

29. **Logging level misuse over speculation**: When normal operational paths log counts, conditions,
    IDs, or affected rows with `Error`/`logger.Error`, prefer the concrete logging-severity finding.
    - DO flag: Error-level logs on successful cleanup, reporting, or batch bookkeeping code
    - Do NOT crowd out that signal with speculative load, throughput, or "10x" performance claims

30. **Authorization cache invalidation symmetry**: For permission and auth caches, inspect whether
    positive and negative results are reused and invalidated consistently.
    - DO flag: Cached "allow" results returned immediately while cached "deny" results are ignored,
      stale denial/grant entries that can survive permission updates, or mixed sources where one branch
      trusts cache and the opposite branch falls through to live authorization state
    - Do NOT downgrade this to a generic TTL/performance comment when the diff shows a concrete
      authorization correctness asymmetry

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
