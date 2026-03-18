/**
 * Framework Pattern Filter (FR-013)
 *
 * Deterministic post-processing filter that catches Pattern B false positives
 * using a closed, default-deny matcher table. Runs in Stage 1 validation
 * (after self-contradiction filter, before Stage 2 diff-bound validation).
 *
 * The matcher table is CLOSED: only these 9 matchers exist.
 * Adding a new matcher requires a spec amendment.
 */

import type { Finding } from '../agents/types.js';

// =============================================================================
// Types
// =============================================================================

export interface FrameworkPatternMatcher {
  /** Unique matcher identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Regex that triggers evaluation when matched against finding.message */
  readonly messagePattern: RegExp;
  /**
   * Validates structural evidence in diff content.
   * Returns true if evidence confirms the framework pattern (suppress finding).
   * Returns false if evidence is missing or ambiguous (pass finding through).
   */
  evidenceValidator: (finding: Finding, diffContent: string) => boolean;
  /** Diagnostic reason logged when finding is suppressed */
  readonly suppressionReason: string;
}

export interface FrameworkFilterResult {
  finding: Finding;
  suppressed: boolean;
  matcherId?: string;
  reason?: string;
}

export interface FrameworkFilterSummary {
  total: number;
  suppressed: number;
  passed: number;
  results: FrameworkFilterResult[];
}

// =============================================================================
// Evidence Helpers
// =============================================================================

/**
 * Extract lines near a finding's line from diff content, scoped to the finding's file.
 * Returns the relevant file's diff section for evidence scanning.
 */
function extractFileDiffSection(finding: Finding, diffContent: string): string {
  if (!finding.file || !diffContent) return '';

  // Normalize Windows backslashes to forward slashes for diff header matching
  const normalizedPath = finding.file.replace(/\\/g, '/');

  // Split diff by file boundaries
  const fileSections = diffContent.split(/^diff --git /m);
  for (const section of fileSections) {
    // Match against the finding's file path (check both a/ and b/ paths)
    if (
      section.includes(`a/${normalizedPath} `) ||
      section.includes(`b/${normalizedPath}`) ||
      section.includes(`a/${normalizedPath}\n`) ||
      section.includes(`b/${normalizedPath}\n`)
    ) {
      return section;
    }
  }
  return '';
}

/**
 * Extract lines near a specific line number from a diff section.
 * Returns lines within a window around the target line.
 */
function extractLinesNearFinding(
  diffSection: string,
  findingLine: number | undefined,
  windowSize = 10
): string[] {
  if (findingLine === undefined) return diffSection.split('\n');

  const lines = diffSection.split('\n');
  const result: string[] = [];
  let currentLine = 0;

  for (const line of lines) {
    // Track line numbers from hunk headers
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch?.[1]) {
      currentLine = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }

    if (line.startsWith('-')) continue; // Skip removed lines

    currentLine++;

    if (currentLine >= findingLine - windowSize && currentLine <= findingLine + windowSize) {
      // Strip diff prefix for content analysis
      const content = line.startsWith('+')
        ? line.slice(1)
        : line.startsWith(' ')
          ? line.slice(1)
          : line;
      result.push(content);
    }
  }

  return result;
}

// =============================================================================
// Composability Helpers (FR-017)
// =============================================================================

/** Return type for extractNearbyContext — provides both line array and joined text. */
interface NearbyContext {
  /** The diff section for the finding's file */
  fileSection: string;
  /** Lines within ±windowSize of the finding line */
  nearbyLines: string[];
  /** nearbyLines joined with '\n' for regex matching */
  nearbyText: string;
}

/**
 * Extract nearby context from a diff for a finding.
 * Replaces the 4-line boilerplate pattern used in 8 of 9 matchers.
 * Returns null if the finding's file is not found in the diff.
 */
function extractNearbyContext(
  finding: Finding,
  diffContent: string,
  windowSize = 10
): NearbyContext | null {
  const fileSection = extractFileDiffSection(finding, diffContent);
  if (!fileSection) return null;
  const nearbyLines = extractLinesNearFinding(fileSection, finding.line, windowSize);
  const nearbyText = nearbyLines.join('\n');
  return { fileSection, nearbyLines, nearbyText };
}

/**
 * Build a RegExp that matches a word-bounded variable name followed by a suffix.
 * Validates that varName contains only word characters to prevent regex injection.
 * SAFETY: All call sites extract varName from \w+ regex matches.
 */
function boundedVarPattern(varName: string, suffix: string): RegExp {
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp('\\b' + varName + suffix);
}

/**
 * Matches server-side HTTP response output calls: res.send(), res.write(), res.end().
 * Extracted from 4 duplicate inline regexes across the error-object-xss matcher.
 */
const RES_RESPONSE_SINK = /\bres\s*\.\s*(?:send|write|end)\s*\(/;

// =============================================================================
// Closed Matcher Table — DEFAULT DENY
// Only these 9 matchers. No additions without spec change.
// =============================================================================

const FRAMEWORK_MATCHERS: readonly FrameworkPatternMatcher[] = [
  // T019: Express Error Middleware
  {
    id: 'express-error-mw',
    name: 'Express Error Middleware',
    messagePattern:
      /unused.*param|declared\s+but\s+never\s+referenced|dead\s+code.*never\s+called|parameter\s+not\s+referenced/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const ctx = extractNearbyContext(finding, diffContent, 5);
      if (!ctx) return false;

      // Must have a 4-parameter function near the finding line
      // Express error middleware signature: (err, req, res, next) or variants
      const fourParamPattern =
        /\(\s*\w+\s*(?::\s*[^,)]+)?\s*,\s*\w+\s*(?::\s*[^,)]+)?\s*,\s*\w+\s*(?::\s*[^,)]+)?\s*,\s*\w+\s*(?::\s*[^,)]+)?\s*\)/;
      if (!fourParamPattern.test(ctx.nearbyText)) return false;

      // At least one Express indicator required (in the file section):
      // - .use() middleware registration call
      // - import from 'express' package
      // - Express type annotations (Request, Response, NextFunction, ErrorRequestHandler)
      const hasUseCall = /\.use\s*\(/.test(ctx.fileSection);
      const hasExpressImport = /from\s+['"]express['"]/.test(ctx.fileSection);
      const hasExpressTypes = /:\s*(?:Request|Response|NextFunction|ErrorRequestHandler)\b/.test(
        ctx.nearbyText
      );

      return hasUseCall || hasExpressImport || hasExpressTypes;
    },
    suppressionReason: 'Express 4-param error middleware — unused params required by framework',
  },

  // T020: TypeScript Unused Prefix
  {
    id: 'ts-unused-prefix',
    name: 'TypeScript Unused Prefix',
    messagePattern: /unused.*(variable|parameter|binding|import)/i,
    evidenceValidator(finding: Finding, _diffContent: string): boolean {
      // Extract identifier names from the finding message.
      // Look for words that could be binding names (alphanumeric + underscore).
      // Confirm at least one is underscore-prefixed (the TS convention).
      const words = finding.message.match(/\b(\w+)\b/g);
      if (!words) return false;

      // The binding name must start with underscore and have at least one more char
      return words.some((word) => /^_\w+$/.test(word));
    },
    suppressionReason: 'TypeScript _prefix convention for intentionally unused bindings',
  },

  // T021: Exhaustive Switch
  {
    id: 'exhaustive-switch',
    name: 'Exhaustive Switch',
    messagePattern: /missing.*case|unhandled.*case|default.*unreachable/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const ctx = extractNearbyContext(finding, diffContent, 8);
      if (!ctx) return false;

      // Scan near finding line for assertNever( or exhaustive throw
      const hasAssertNever = /assertNever\s*\(/.test(ctx.nearbyText);
      const hasExhaustiveThrow =
        /throw\s+new\s+\w*[Ee]rror\s*\(\s*['"`].*(?:exhaustive|unreachable|unexpected)/i.test(
          ctx.nearbyText
        );

      return hasAssertNever || hasExhaustiveThrow;
    },
    suppressionReason:
      'Exhaustive switch with assertNever/throw — all cases handled at compile time',
  },

  // T022: React Query Advisory (dedup, error handling, data fetching concerns)
  {
    id: 'react-query-dedup',
    name: 'React Query Advisory',
    messagePattern:
      /duplicate|double.?fetch|redundant.*query|multiple.*useQuery|(?:verify|ensure|validate).*(?:endpoint|api|fetch).*(?:return|format|response|error|handle)|missing.*error.*handling.*(?:fetch|query|useQuery)|error.?handling.*(?:useQuery|useSWR)/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const ctx = extractNearbyContext(finding, diffContent, 10);
      if (!ctx) return false;

      // Evidence 1: Query library import in file section
      const hasQueryImport =
        /from\s+['"]@tanstack\/react-query['"]/.test(ctx.fileSection) ||
        /from\s+['"]swr['"]/.test(ctx.fileSection) ||
        /from\s+['"]@apollo\/client['"]/.test(ctx.fileSection);
      if (!hasQueryImport) return false;

      // Evidence 2: Query hook call near the finding line
      const hasQueryHook = /\b(useQuery|useSWR|useInfiniteQuery)\s*\(/.test(ctx.nearbyText);
      if (!hasQueryHook) return false;

      // Evidence 3: Exclude raw HTTP findings (not about library dedup)
      if (/api\s*call|http\s*request|\bfetch\s*\(/.test(finding.message.toLowerCase())) {
        return false;
      }

      // Evidence 4: When the finding is about missing error handling, require BOTH:
      //   (a) error/isError is destructured from the hook result, AND
      //   (b) the destructured binding is used in a conditional branch on error state
      //       (if-check, short-circuit, ternary). Property access alone (error?.message)
      //       is NOT sufficient — logging or rendering a field without branching does
      //       not prove the component handles the error for the user.
      const isErrorHandlingFinding = /missing.*error|error.*handling/i.test(finding.message);
      if (isErrorHandlingFinding) {
        // Step (a): error/isError must appear in a destructuring pattern.
        // Extract the actual binding name (handles aliases like { error: queryError }).
        const errorBindings: string[] = [];

        // Match shorthand `{ ..., error, ... }` or `{ ..., isError, ... }`
        // and aliased `{ ..., error: NAME, ... }` or `{ ..., isError: NAME, ... }`
        const destructuringBlock = ctx.nearbyText.match(/\{\s*([^}]*\b(?:error|isError)\b[^}]*)\}/);
        if (!destructuringBlock?.[1]) return false;

        const blockContent = destructuringBlock[1];
        // Check for alias pattern: `error: someAlias` or `isError: someAlias`
        const aliasMatches = blockContent.matchAll(/\b(?:error|isError)\s*:\s*(\w+)/g);
        for (const m of aliasMatches) {
          if (m[1]) errorBindings.push(m[1]);
        }
        // Check for shorthand: `error` or `isError` without `: alias`
        if (/\berror\b(?!\s*:)/.test(blockContent)) {
          errorBindings.push('error');
        }
        if (/\bisError\b(?!\s*:)/.test(blockContent)) {
          errorBindings.push('isError');
        }

        if (errorBindings.length === 0) return false;

        // Step (b): At least one extracted binding must appear in a conditional branch
        // on error state: if-check, short-circuit (&&), or ternary (?).
        // SAFETY: bindings are from \w+ match — only [a-zA-Z0-9_], no regex special chars.
        //
        // Fail-open patterns (not checked, finding passes through):
        //   - binding used only as callback argument
        //   - binding only logged (console.log/console.error)
        //   - property access without conditional guard (error?.message)
        //   - nested destructuring from the binding
        const hasErrorUsage = errorBindings.some((binding) => {
          // eslint-disable-next-line security/detect-non-literal-regexp
          const ifCheck = new RegExp('\\bif\\s*\\(\\s*' + binding + '\\b');
          const shortCircuit = boundedVarPattern(binding, '\\s*&&');
          // Ternary: `binding ? ... : ...` — must exclude optional chaining `binding?.`
          const ternary = boundedVarPattern(binding, '\\s*\\?(?!\\.)');

          return (
            ifCheck.test(ctx.nearbyText) ||
            shortCircuit.test(ctx.nearbyText) ||
            ternary.test(ctx.nearbyText)
          );
        });
        if (!hasErrorUsage) return false;
      }

      return true;
    },
    suppressionReason:
      'Query library handles caching, dedup, and error state — advisory is redundant',
  },

  // T023: Promise.allSettled Convention (Order + Error Handling)
  {
    id: 'promise-allsettled-order',
    name: 'Promise.allSettled Convention',
    messagePattern:
      /allSettled.*(?:order|sequence|reject|unhandled|error.?handling|silent)|(?:order|sequence).*allSettled|(?:unhandled|missing|silent).*(?:reject|error|exception).*(?:promise|settled)|allSettled.*results.*not.*(?:match|correspond|align)|(?:additional|need).*error.*handling.*(?:promise|fetch|request|response|processing)|verify.*(?:fetch|request).*(?:error|handling|additional|response)/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const ctx = extractNearbyContext(finding, diffContent, 10);
      if (!ctx) return false;

      // Evidence 1: Promise.allSettled call near the finding line (not just file-wide)
      if (!/Promise\.allSettled\s*\(/.test(ctx.nearbyText)) return false;

      // Evidence 2+3: Iteration and .status must be BOUND to the allSettled result variable.
      // Unscoped checks (any .forEach + any .status in nearbyText) allow false suppression
      // when unrelated iteration or HTTP .status references exist nearby.

      // Step 2a: Extract the result variable name.
      // Primary: `const/let/var X = await Promise.allSettled(...)`
      const allSettledVarMatch = ctx.nearbyText.match(
        /\b(?:const|let|var)\s+(\w+)\s*=\s*await\s+Promise\.allSettled\s*\(/
      );
      let varName = allSettledVarMatch?.[1];

      // Fallback: `.then()` chain — `Promise.allSettled(...).then((X) => ...)` or
      // `.then(X => ...)` or `.then(function(X) { ... })`.
      // NOTE: This is a bounded heuristic over the ±10-line diff window, not a
      // structurally correct parser. The lazy [\s\S]*? relies on regex backtracking
      // to find the closing paren of allSettled(...) when nested parens are present.
      // This is acceptable given the small window size but is not balanced-paren parsing.
      // Fail-open patterns (not checked):
      //   - separated await: `const p = Promise.allSettled(...); const r = await p;`
      //   - named function reference: `.then(handleResults)`
      //   - generator patterns
      if (!varName) {
        const thenMatch = ctx.nearbyText.match(
          /Promise\.allSettled\s*\([\s\S]*?\)\.then\s*\(\s*(?:function\s*\(\s*(\w+)|(\w+)\s*=>|\(\s*(\w+)\s*\)\s*=>)/
        );
        varName = thenMatch?.[1] ?? thenMatch?.[2] ?? thenMatch?.[3];
      }
      if (!varName) return false; // Cannot identify result variable — fail open

      // Step 2b: Require iteration to reference the allSettled result variable.
      // SAFETY: varName is from \w+ match — only [a-zA-Z0-9_], no regex special chars.
      // eslint-disable-next-line security/detect-non-literal-regexp
      const iterationPattern = new RegExp(
        '\\b' +
          varName +
          '\\s*\\.\\s*forEach\\s*\\(' +
          '|for\\s*\\([^)]*\\s+of\\s+' +
          varName +
          '\\b' +
          '|\\b' +
          varName +
          '\\s*\\['
      );
      if (!iterationPattern.test(ctx.nearbyText)) return false;

      // Step 2c: .status check must appear on the iteration callback parameter,
      // not on an unrelated variable. Extract the callback/loop variable name
      // and require PARAM.status in nearbyText.
      let hasStatusCheck = false;

      // Pattern A: VARNAME.forEach((PARAM, ...) => { ... PARAM.status ... })
      const forEachParamMatch = ctx.nearbyText.match(
        boundedVarPattern(varName, '\\s*\\.\\s*forEach\\s*\\(\\s*(?:\\(\\s*)?(\\w+)')
      );
      if (forEachParamMatch?.[1]) {
        const cbParam = forEachParamMatch[1];
        hasStatusCheck = boundedVarPattern(cbParam, '\\.status\\b').test(ctx.nearbyText);
      }

      // Pattern B: for (const LOOPVAR of VARNAME) { ... LOOPVAR.status ... }
      if (!hasStatusCheck) {
        const forOfMatch = ctx.nearbyText.match(
          // eslint-disable-next-line security/detect-non-literal-regexp
          new RegExp('for\\s*\\(\\s*(?:const|let|var)\\s+(\\w+)\\s+of\\s+' + varName + '\\b')
        );
        if (forOfMatch?.[1]) {
          const loopVar = forOfMatch[1];
          hasStatusCheck = boundedVarPattern(loopVar, '\\.status\\b').test(ctx.nearbyText);
        }
      }

      // Pattern C: indexed access VARNAME[i].status
      if (!hasStatusCheck) {
        hasStatusCheck = boundedVarPattern(varName, '\\s*\\[\\w+\\]\\s*\\.\\s*status\\b').test(
          ctx.nearbyText
        );
      }

      if (!hasStatusCheck) return false;

      return true;
    },
    suppressionReason: 'Promise.allSettled convention — results handled per ECMAScript spec',
  },
  // T025: Safe Local File Read
  {
    id: 'safe-local-file-read',
    name: 'Safe Local File Read',
    messagePattern:
      /path.*traversal|directory.*traversal|local.*file.*read|file.*inclusion|readFileSync.*block|synchronous.*file.*read|block.*event.*loop.*(?:read|file)/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const ctx = extractNearbyContext(finding, diffContent, 10);
      if (!ctx) return false;

      // Single-line only: check each line individually (per FR-011 scope limitation)
      const canonicalPattern =
        /path\.(join|resolve)\s*\(\s*(?:__dirname|__filename|import\.meta\.(?:dirname|filename|url))\s*(?:,\s*(['"])[^'"]*\2\s*)*\)/;

      let match: RegExpExecArray | null = null;
      for (const line of ctx.nearbyLines) {
        match = canonicalPattern.exec(line);
        if (match) break;
      }
      if (!match) return false;

      // Extract the full matched path expression for safety checks
      const matchedExpr = match[0];

      // B1: Reject if any string literal segment contains '..' (path traversal)
      const stringSegments = matchedExpr.match(/(['"])[^'"]*\1/g);
      if (stringSegments) {
        for (const seg of stringSegments) {
          const content = seg.slice(1, -1);
          if (content.includes('..')) return false;
        }
      }

      // B2: Reject if any string literal segment starts with '/' or drive letter (absolute path)
      if (stringSegments) {
        for (const seg of stringSegments) {
          const content = seg.slice(1, -1);
          if (content.startsWith('/')) return false;
          if (/^[a-zA-Z]:/.test(content)) return false;
        }
      }

      // B3: Performance findings (sync I/O blocking) require module-top-level scope.
      // Path safety only proves the read is traversal-safe, NOT that blocking I/O
      // is acceptable. Sync reads inside functions, callbacks, or request handlers
      // are legitimate performance concerns that must not be suppressed.
      //
      // Criteria: a finding is "performance-typed" if its message matches the sync-read
      // patterns but NOT the security patterns (traversal/inclusion). For such findings:
      //   1. The readFileSync call must be a direct module-scope declaration (const/let/var
      //      at ≤2 leading spaces — not nested inside any function, arrow, or callback body)
      //   2. No request-handler or event-listener context within ±10 lines
      const isPerformanceFinding =
        /readFileSync.*block|synchronous.*file.*read|block.*event.*loop/i.test(finding.message) &&
        !/path.*traversal|directory.*traversal|file.*inclusion/i.test(finding.message);

      if (isPerformanceFinding) {
        // Require that at least one nearby line is a module-top-level declaration
        // (starts with at most 2 spaces of indentation followed by const/let/var/export).
        // Lines indented ≥4 spaces are inside a function body (not top-level).
        const hasTopLevelDecl = ctx.nearbyLines.some((l) =>
          /^\s{0,2}(?:export\s+)?(?:const|let|var)\s+\w+\s*=/.test(l)
        );
        if (!hasTopLevelDecl) return false;

        // Reject if a request-handler, middleware, or event-listener pattern appears
        // anywhere within the ±10-line window (nearbyText).
        if (
          /\b(?:app|router)\s*\.\s*(?:get|post|put|patch|delete|use|all)\s*\(/.test(
            ctx.nearbyText
          ) ||
          /\.on\s*\(\s*['"]/.test(ctx.nearbyText) ||
          /addEventListener\s*\(/.test(ctx.nearbyText) ||
          /(?:req|request)\s*,\s*(?:res|response)\s*[,)]/.test(ctx.nearbyText)
        )
          return false;
      }

      return true;
    },
    suppressionReason:
      'Safe local file read — path.join/resolve with __dirname and string literals only',
  },

  // T026: Exhaustive Type-Narrowed Switch
  {
    id: 'exhaustive-type-narrowed-switch',
    name: 'Exhaustive Type-Narrowed Switch',
    messagePattern: /missing.*(?:case|default)|no.*default|add.*default|non-?exhaustive/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const ctx = extractNearbyContext(finding, diffContent, 10);
      if (!ctx) return false;

      // Evidence 1: switch target must be a simple identifier (not a property access).
      // Property-access targets like switch(node.type) or switch(event.kind) cannot
      // have their type proven from a local annotation — fail open (do not suppress).
      const switchTargetMatch = ctx.nearbyText.match(/\bswitch\s*\((\w+)\)/);
      if (!switchTargetMatch?.[1]) return false;
      const varName = switchTargetMatch[1];

      // Safety constraint: reject if the switch target variable is typed as string or number.
      // A string/number-typed switch is inherently open-domain — not exhaustive.
      if (boundedVarPattern(varName, '\\s*:\\s*(?:string|number)\\b').test(ctx.nearbyText))
        return false;

      // Evidence 2: the switch variable must have a named type annotation (PascalCase),
      // and that exact named type must be declared as a string-literal union in the
      // visible diff/file section. Inferred types (no annotation) and imported types
      // (not defined in the diff) MUST NOT trigger suppression — fail open.
      //
      // Step 2a: extract the type name from the variable's annotation in ±10 lines.
      // e.g., `function f(theme: Theme)` → typeName = 'Theme'
      const typeNameMatch = ctx.nearbyText.match(
        boundedVarPattern(varName, '\\s*:\\s*([A-Z][\\w]*)')
      );
      if (!typeNameMatch?.[1]) return false; // no visible annotation → cannot prove union
      const typeName = typeNameMatch[1];

      // Step 2b: verify that typeName is defined as a string-literal union in the file
      // diff section. Only string-literal unions declared in the visible diff count.
      // e.g., `type Theme = 'light' | 'dark'`
      // SAFETY: typeName is from [A-Z][\w]* match — only [a-zA-Z0-9_], no regex special chars.
      // eslint-disable-next-line security/detect-non-literal-regexp
      const unionDeclarationPattern = new RegExp(
        '\\btype\\s+' + typeName + '\\s*=\\s*((?:[\'"][^\'"]+[\'"]\\s*\\|?\\s*)+)'
      );
      const unionMatch = ctx.fileSection.match(unionDeclarationPattern);
      if (!unionMatch?.[1]) return false;

      // Step 2c: verify every union member VALUE has a corresponding case branch.
      // Uses set-membership (not count comparison) to prevent duplicate case values
      // from inflating the count. e.g., case 'light', case 'light' = 1 unique value,
      // not 2 — so a 3-member union with a duplicate case is correctly rejected.
      const unionMemberQuoted = unionMatch[1].match(/['"][^'"]+['"]/g) ?? [];
      if (unionMemberQuoted.length === 0) return false;

      // Extract raw string values (without quotes) from union members
      const unionMemberValues = unionMemberQuoted.map((m) => m.slice(1, -1));

      // Extract raw string values from case branches (deduplicated via Set)
      const caseBranchMatches = ctx.nearbyText.match(/\bcase\s+['"]([^'"]+)['"]\s*:/g) ?? [];
      const caseValues = new Set(
        caseBranchMatches.map((m) => {
          const val = m.match(/['"]([^'"]+)['"]/);
          return val?.[1] ?? '';
        })
      );

      // Every union member must have a matching case branch (set membership)
      const allMembersCovered = unionMemberValues.every((member) => caseValues.has(member));
      if (!allMembersCovered) return false;

      return true;
    },
    suppressionReason: 'Exhaustive type-narrowed switch — union type with all members covered',
  },

  // Convention 18: Error Object XSS
  {
    id: 'error-object-xss',
    name: 'Error Object XSS',
    messagePattern:
      /(?:xss|inject).*(?:error|err)\b.*(?:message|\.message)|(?:error|err)\b.*(?:message|\.message).*(?:xss|inject|innerHTML|template)|(?:xss|inject).*error.*(?:directly|message)|error\s+message.*(?:xss|inject|innerHTML)/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const ctx = extractNearbyContext(finding, diffContent, 10);
      if (!ctx) return false;

      // MANDATORY: catch clause visible (structural proof of error origin)
      // No naming heuristics, no function-name matching (security-engineer mandate)
      if (!/\bcatch\s*\(\s*\w+/.test(ctx.nearbyText)) return false;

      // MANDATORY: error.message usage visible (the flagged construct)
      if (!/\.\s*message\b/.test(ctx.nearbyText)) return false;

      // REJECT: error constructed from user input or external API data.
      // Errors built from req.body, query params, or external input can contain
      // attacker-controlled data — suppression would hide real XSS.
      if (
        /new\s+(?:\w+)?Error\s*\(\s*(?:req\.|request\.|body\.|params\.|query\.|input\.|data\.|payload\.)/.test(
          ctx.nearbyText
        )
      )
        return false;

      // REJECT: direct DOM manipulation (browser-side sinks)
      if (
        /\.innerHTML\s*=|\.outerHTML\s*=|document\.write\s*\(|insertAdjacentHTML\s*\(/.test(
          ctx.nearbyText
        )
      )
        return false;

      // REJECT: React dangerouslySetInnerHTML (always renders raw HTML)
      if (/dangerouslySetInnerHTML/.test(ctx.nearbyText)) return false;

      // REJECT: server-side HTTP response sinks that render error.message as HTML.
      // Only triggers when BOTH a response output call AND .message appear within
      // the same ±10-line window (nearbyText), proving the error data flows into
      // the response. Plain-text responses (res.send(err.message) without HTML
      // markup) are excluded by requiring an HTML indicator (< or template literal).
      if (RES_RESPONSE_SINK.test(ctx.nearbyText)) {
        // Check for HTML evidence: template literal with tags, or string with '<'
        const hasHtmlInResponse =
          /\bres\s*\.\s*(?:send|write|end)\s*\(\s*`[^`]*</.test(ctx.nearbyText) ||
          /\bres\s*\.\s*(?:send|write|end)\s*\([^)]*['"][^'"]*</.test(ctx.nearbyText) ||
          /\bres\s*\.\s*(?:send|write|end)\s*\([^)]*\+[^)]*['"]?\s*</.test(ctx.nearbyText);
        if (hasHtmlInResponse) return false;

        // FR-015: Variable-backed HTML detection.
        // Catches: `const html = `<p>${err}</p>`; res.send(html);`
        // Extract variable name from res.send(varName) and check if the variable
        // was assigned HTML-containing content in the nearby text.
        const varMatch = ctx.nearbyText.match(/\bres\s*\.\s*(?:send|write|end)\s*\(\s*(\w+)\s*\)/);
        if (varMatch?.[1]) {
          const sendVarName = varMatch[1];
          if (
            boundedVarPattern(sendVarName, '\\s*=\\s*(?:`[^`]*<|[\'"][^\'"]*<)').test(
              ctx.nearbyText
            )
          )
            return false;
        }
      }

      // REJECT: template engine render calls (always produce HTML output)
      if (
        /\bres\s*\.\s*render\s*\(/.test(ctx.nearbyText) ||
        /\b(?:ejs|pug|handlebars|hbs|nunjucks|mustache)\s*[.(]/.test(ctx.nearbyText)
      )
        return false;

      return true;
    },
    suppressionReason:
      'Error from catch clause — error.message is runtime exception, not user input',
  },

  // Convention 19: Thin Wrapper Stdlib
  {
    id: 'thin-wrapper-stdlib',
    name: 'Thin Wrapper Stdlib',
    messagePattern:
      /(?:missing|add|no).*try.?catch|(?:could|may|might).*throw|unhandled.*(?:error|exception).*(?:JSON\.parse|parseInt|parseFloat|new\s+URL|Buffer\.from|decodeURI)|directly.*(?:return|call).*(?:JSON\.parse|parseInt|parseFloat)/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const ctx = extractNearbyContext(finding, diffContent, 5);
      if (!ctx) return false;

      // Evidence 1: WHITELISTED stdlib call present (no open patterns)
      const SAFE_STDLIB =
        /\b(?:JSON\.parse|JSON\.stringify|parseInt|parseFloat|Number\(|new\s+URL|Buffer\.from|decodeURIComponent|decodeURI|atob|btoa)\s*\(/;
      if (!SAFE_STDLIB.test(ctx.nearbyText)) return false;

      // Evidence 2: thin wrapper structure (return + stdlib)
      if (!/\breturn\s+/.test(ctx.nearbyText)) return false;

      // REJECT: I/O operations (not pure stdlib delegation)
      if (
        /\b(?:fs\.|fetch\s*\(|await\s|\.readFile|\.writeFile|database|\.query\s*\()/.test(
          ctx.nearbyText
        )
      )
        return false;

      // REJECT: conditional logic (not a thin wrapper)
      if (/\b(?:if\s*\(|else\b|switch\s*\()/.test(ctx.nearbyText)) return false;

      // REJECT: request handler context (caller responsibility matters here)
      if (/\b(?:req\.|request\.|res\.|response\.|app\.\w+\(|router\.\w+\()/.test(ctx.nearbyText))
        return false;

      return true;
    },
    suppressionReason: 'Thin wrapper around stdlib function — try-catch is caller responsibility',
  },
] as const;

// =============================================================================
// Public API
// =============================================================================

/**
 * Evaluate findings against the closed matcher table.
 * Default-deny: only exact matches with validated evidence are suppressed.
 *
 * @param findings - Findings that passed Stage 1 semantic validation
 * @param diffContent - Raw diff content for evidence validation
 * @returns Summary with suppressed/passed findings and diagnostic details
 */
export function filterFrameworkConventionFindings(
  findings: Finding[],
  diffContent: string,
  disableMatchers: string[] = []
): FrameworkFilterSummary {
  const disabledSet = new Set(disableMatchers);
  const results: FrameworkFilterResult[] = [];
  let suppressed = 0;

  if (disabledSet.size > 0) {
    console.log(`[router] [framework-filter] Disabled matchers: ${[...disabledSet].join(', ')}`);
  }

  for (const finding of findings) {
    let matched = false;

    for (const matcher of FRAMEWORK_MATCHERS) {
      // Skip disabled matchers (FR-022 disable_matchers)
      if (disabledSet.has(matcher.id)) continue;

      // Step 1: Does the message pattern match?
      if (!matcher.messagePattern.test(finding.message)) continue;

      // Step 2: Does structural evidence confirm the pattern?
      if (matcher.evidenceValidator(finding, diffContent)) {
        results.push({
          finding,
          suppressed: true,
          matcherId: matcher.id,
          reason: matcher.suppressionReason,
        });
        suppressed++;
        matched = true;
        console.log(
          `[router] [framework-filter] Suppressed: ${matcher.id} — ${finding.file}:${finding.line ?? '?'} — ${matcher.suppressionReason}`
        );
        break; // First matching matcher wins
      }
    }

    if (!matched) {
      results.push({ finding, suppressed: false });
    }
  }

  return {
    total: findings.length,
    suppressed,
    passed: findings.length - suppressed,
    results,
  };
}

/**
 * Get the list of valid findings (non-suppressed) from a filter summary.
 */
export function getValidFindings(summary: FrameworkFilterSummary): Finding[] {
  return summary.results.filter((r) => !r.suppressed).map((r) => r.finding);
}
