# Feature Specification: Reduce AI Review False Positives

**Feature Branch**: `409-reduce-review-false-positives`
**Created**: 2026-02-06
**Status**: Draft
**Input**: User description: "Improve AI review agent prompts to reduce false positive findings on consumer pull requests, based on documented feedback patterns"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Security-context false positives are eliminated (Priority: P1)

A developer opens a pull request that uses `innerHTML` with hardcoded string literals or internal error objects (not user-supplied data). The AI review agents analyze the diff and correctly determine that no user-controlled data flows into the DOM sink, so they do NOT flag it as an XSS vulnerability. Similarly, `console.log` calls with internal strings are not flagged as "format specifier injection" because browser console APIs do not process printf-style specifiers.

**Why this priority**: Security false positives are the highest-noise category. They cause alert fatigue and erode developer trust in the review system. When every PR gets flagged for "XSS" on a hardcoded string, developers learn to ignore all findings.

**Independent Test**: Can be tested by submitting a PR containing `innerHTML = '<p>Loading...</p>'` and `console.log('Error:', err)` and verifying that no XSS or format-specifier findings are produced.

**Acceptance Scenarios**:

1. **Given** a diff containing `element.innerHTML = '<p>Error occurred</p>'` (a hardcoded string literal), **When** the AI review agents analyze the diff, **Then** no XSS or innerHTML-related finding is produced.
2. **Given** a diff containing `console.log('Office:', officeCode)` where `officeCode` is an internal variable (not user input), **When** the AI review agents analyze the diff, **Then** no format-specifier injection finding is produced.
3. **Given** a diff containing `element.innerHTML = userInput` where `userInput` originates from a form field or URL parameter, **When** the AI review agents analyze the diff, **Then** a security finding IS produced (true positive preserved).

---

### User Story 2 - CSS and UI pattern false positives are eliminated (Priority: P2)

A developer opens a pull request that uses standard CSS patterns: a media query that switches `display: grid` to `display: flex`, `overflow-y: auto` on a bottom sheet panel, or `touch-action: manipulation` on a specific container element. The AI review agents correctly understand that these are standard, well-defined CSS behaviors and do NOT flag them as potential conflicts, nested scrolling issues, or overly-broad selectors.

**Why this priority**: UI/CSS false positives waste developer time investigating non-issues. They represent the AI reviewer applying generic "best practices" without verifying the actual code context.

**Independent Test**: Can be tested by submitting a PR with a CSS media query that changes `display: grid` to `display: flex` and verifying no "grid property conflict" finding is produced.

**Acceptance Scenarios**:

1. **Given** a diff with a media query that sets `display: flex` overriding a base rule with `display: grid`, **When** agents review the diff, **Then** no finding about "lingering grid properties" is produced.
2. **Given** a diff with `overflow-y: auto` on a container that renders flat text content, **When** agents review the diff, **Then** no finding about "nested scrolling issues" is produced.
3. **Given** a diff that applies `touch-action: manipulation` to `.map-container`, **When** agents review the diff, **Then** no finding claiming it's applied to `body` is produced, and no "overly broad" finding is produced.

---

### User Story 3 - State machine and deliberate design choices are respected (Priority: P2)

A developer opens a pull request implementing a state machine with a finite, typed set of states. A handler that performs no action for a particular state transition is a deliberate design choice. The AI review agents correctly recognize that type-enforced state machines with intentional no-ops do not need "fallback for unexpected states." Similarly, test files that document known trade-offs in comments are not flagged for "re-implementing logic."

**Why this priority**: These false positives demonstrate the AI reviewer ignoring explicit code context (type constraints, inline comments) in favor of generic rules. Addressing this builds trust that the reviewer reads the code, not just patterns.

**Independent Test**: Can be tested by submitting a PR with a type-constrained switch statement that has an intentional no-op case and verifying no "missing fallback" finding is produced.

**Acceptance Scenarios**:

1. **Given** a diff with a switch statement over a typed enum where one case intentionally does nothing, **When** agents review the diff, **Then** no finding about "missing fallback for unexpected states" is produced.
2. **Given** a test file containing a comment explaining why logic is replicated locally (e.g., "complex transitive dependencies make direct instantiation impractical"), **When** agents review the diff, **Then** no finding about "re-implementing logic in test files" is produced, or if flagged, the finding acknowledges the documented trade-off.

---

### User Story 4 - Agents cite exact code in findings (Priority: P3)

When AI review agents do produce a finding, the finding accurately references the actual code element being flagged. Agents do not misattribute CSS rules to wrong selectors, misidentify which element a property is applied to, or confuse diff context lines with changed lines.

**Why this priority**: Even when a finding category is valid, misattributing the location destroys credibility. A finding about `touch-action` on `body` when the code says `.map-container` is worse than no finding at all.

**Independent Test**: Can be tested by submitting a PR and verifying that each produced finding's file, line, and code reference match the actual diff content.

**Acceptance Scenarios**:

1. **Given** any diff that produces AI-generated findings, **When** a finding references a specific CSS selector, HTML element, or code construct, **Then** the referenced element exists in the diff at or near the reported line.
2. **Given** a diff where a CSS property is applied to `.map-container` (not `body`), **When** agents produce a finding about that property, **Then** the finding correctly names `.map-container` as the target.

---

### Edge Cases

- What happens when a finding category is borderline (e.g., `innerHTML = sanitize(userInput)`)? The agents should still flag it but note the sanitization, rather than suppressing it entirely.
- What happens when a `.prettierignore` or configuration file is in the diff? Agents should not flag standard tooling configuration choices as issues unless they introduce clear problems.
- What happens when a test file intentionally duplicates logic but does NOT have an explanatory comment? Agents may still flag it as a suggestion (info severity), since the trade-off isn't documented.
- What happens when data flow is ambiguous (e.g., a variable named `content` assigned from a function whose source isn't in the diff)? Agents should report at `info` severity with an uncertainty annotation, not at `warning` or `error`.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The semantic review prompt file (`config/prompts/semantic_review.md`) MUST exist and be loaded by the `ai_semantic_review` agent instead of the hardcoded fallback prompt.
- **FR-002**: All AI agent prompts (semantic review, PR agent, opencode) MUST include a "False Positive Prevention" section instructing the model to verify data-flow context before flagging security sinks (innerHTML, eval, dangerouslySetInnerHTML, console.log format injection).
- **FR-003**: All AI agent prompts MUST instruct the model to verify claims against the actual diff content, including quoting the exact code or selector being flagged.
- **FR-004**: All AI agent prompts MUST instruct the model to respect type-system constraints (typed enums, discriminated unions) when evaluating completeness of switch/if-else handlers.
- **FR-005**: All AI agent prompts MUST instruct the model to understand standard CSS cascade behavior: that changing `display` fully overrides prior display-mode properties, that `overflow-y: auto` without nested scroll containers is safe, and that scoped selectors are not "overly broad."
- **FR-006**: All AI agent prompts MUST instruct the model to read and respect documented trade-offs in code comments before flagging deliberate patterns.
- **FR-007**: The hardcoded fallback prompts in the agent source files MUST be updated to include a condensed version of the false-positive prevention guidance, so the system degrades gracefully when prompt files are missing.
- **FR-008**: All prompt changes MUST preserve the existing JSON response format requirements and line numbering instructions without modification.
- **FR-009**: All prompt changes MUST NOT suppress true positives — the guidance must teach contextual analysis, not blanket suppression of categories.
- **FR-010**: Prompt structure MUST use an explicit instruction hierarchy: top-level obligations ("ALWAYS verify data flow before flagging a security sink", "ALWAYS quote the exact code you are flagging") MUST appear as numbered rules near the top of the prompt, before any domain-specific guidance sections. Supporting details and examples MUST appear below these rules, not inline with them. This prevents instruction dilution as prompt length grows.
- **FR-011**: When a finding is ambiguous or borderline, agents MUST downgrade severity to `info` and annotate the finding message with their uncertainty (e.g., "Potential issue — verify that...") rather than either suppressing the finding entirely or reporting it at full severity. This ensures consistent tone across the silence-to-alarm spectrum.
- **FR-012**: The hardcoded fallback prompt (FR-007) MUST be derived by mechanical extraction from the file-based prompt — not written independently. The implementation MUST include a process or convention that keeps the fallback in sync when the file-based prompt is updated, to prevent drift between normal and degraded modes.

### Key Entities

- **Agent Prompt**: A system prompt or instruction file that guides an AI model's review behavior. Exists as both a file on disk (`config/prompts/*.md`) and a hardcoded fallback in agent source code.
- **Finding**: A structured review comment produced by an agent, containing severity, file, line, message, suggestion, and category. The unit of output that is either a true positive or a false positive.
- **False Positive**: A finding that flags code that is correct, safe, and intentional. The primary problem this feature addresses.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: When a PR containing hardcoded-string innerHTML assignments and internal-variable console.log calls is reviewed, zero security findings are produced for those patterns (down from 2+ findings per PR today).
- **SC-002**: When a PR containing standard CSS media query overrides (grid to flex), scoped touch-action, or flat-content overflow-y is reviewed, zero false-positive CSS findings are produced.
- **SC-003**: When a PR containing a type-constrained state machine with intentional no-ops is reviewed, zero "missing fallback" findings are produced.
- **SC-004**: 100% of findings produced by AI agents reference code constructs that actually exist in the diff at the reported location (no misattributed selectors or elements).
- **SC-005**: True positive detection rate is maintained — PRs with actual XSS vulnerabilities (user input flowing to innerHTML), actual missing error handling, and actual security issues continue to produce findings.
- **SC-006**: The `semantic_review.md` prompt file exists and is successfully loaded by the agent (verified by absence of "Using default prompt" log message).
- **SC-007**: When a finding involves ambiguous data flow (source not visible in the diff), the finding severity is `info` and the message includes an uncertainty qualifier — not `warning` or `error`.
- **SC-008**: The hardcoded fallback prompts contain the same top-level obligation rules as the file-based prompts, verified by inspection or automated comparison during review.
