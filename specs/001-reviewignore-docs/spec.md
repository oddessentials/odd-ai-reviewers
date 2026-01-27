# Feature Specification: .reviewignore Documentation Improvements

**Feature Branch**: `001-reviewignore-docs`
**Created**: 2026-01-27
**Status**: Draft
**Input**: Improve .reviewignore documentation: add pattern normalization section, expand bare segment matching explanation, add negation examples, and consolidate filter precedence to reduce redundancy

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Understanding Pattern Normalization (Priority: P1)

A developer configuring `.reviewignore` wants to understand how their patterns are transformed internally so they can write correct exclusion rules without trial and error.

**Why this priority**: Pattern normalization is the core concept users are missing. Without understanding how `node_modules` becomes `**/node_modules`, users cannot predict behavior and may write ineffective patterns.

**Independent Test**: Can be fully tested by reading the new Pattern Normalization section and correctly predicting the behavior of sample patterns.

**Acceptance Scenarios**:

1. **Given** a developer reads the Pattern Normalization section, **When** they see a bare name like `node_modules`, **Then** they understand it transforms to `**/node_modules` and matches anywhere in the path.
2. **Given** a developer reads the Pattern Normalization section, **When** they see a leading `/` pattern like `/config.js`, **Then** they understand it matches only at the repository root.
3. **Given** a developer reads the Pattern Normalization section, **When** they see a trailing `/` pattern like `dist/`, **Then** they understand it becomes `**/dist/**` for recursive directory matching.
4. **Given** a developer reads the Pattern Normalization section, **When** they see a path-relative pattern like `src/generated`, **Then** they understand it matches relative to the repository root without transformation.

---

### User Story 2 - Predicting Bare Segment Matching (Priority: P2)

A developer wants to understand exactly what files will be excluded when using bare segment names (like `node_modules`) so they can avoid accidentally excluding or including files.

**Why this priority**: Bare segments are the most common pattern type but have subtle matching semantics that cause confusion. Clarifying what matches (and what doesn't) prevents misconfiguration.

**Independent Test**: Can be fully tested by reading the expanded bare segment documentation and correctly predicting which files match a given bare segment pattern.

**Acceptance Scenarios**:

1. **Given** a developer reads the bare segment documentation, **When** they use the pattern `node_modules`, **Then** they understand it matches `node_modules/`, `node_modules/lodash/index.js`, and `src/node_modules/local/file.js`.
2. **Given** a developer reads the bare segment documentation, **When** they use the pattern `node_modules`, **Then** they understand it does NOT match `node_modules_backup/file.js` (prefix match).
3. **Given** a developer reads the bare segment documentation, **When** they want to exclude only a root-level directory, **Then** they know to use `/node_modules` instead of `node_modules`.

---

### User Story 3 - Using Negation with Bare Segments (Priority: P3)

A developer wants to exclude a directory but keep specific files within it for review, using negation patterns.

**Why this priority**: Negation is a power-user feature that enables fine-grained control. Documenting this pattern unlocks advanced use cases without users having to discover it through experimentation.

**Independent Test**: Can be fully tested by reading the negation examples and successfully configuring a `.reviewignore` that excludes a directory while keeping specific files.

**Acceptance Scenarios**:

1. **Given** a developer reads the negation examples, **When** they want to exclude `node_modules` but keep `node_modules/important-patch.js`, **Then** they can write the correct two-line pattern to achieve this.
2. **Given** a developer reads the negation examples, **When** they apply the pattern, **Then** the negated file appears in the review while other files in the directory remain excluded.

---

### User Story 4 - Finding Filter Precedence Information (Priority: P4)

A developer wants to understand the order in which `.reviewignore` and `path_filters` are applied without having to search multiple documentation files.

**Why this priority**: Consolidating redundant information improves maintainability and ensures users find accurate, up-to-date information in one place.

**Independent Test**: Can be fully tested by finding filter precedence information in a single canonical location with clear cross-references from other documents.

**Acceptance Scenarios**:

1. **Given** a developer reads the README filter flow description, **When** they need detailed precedence information, **Then** they find a clear link to the canonical source in `docs/config-schema.md`.
2. **Given** a developer reads `docs/ARCHITECTURE.md`, **When** they encounter filter precedence, **Then** they find a reference to the canonical source rather than duplicated content.

---

### Edge Cases

- What happens when a user reads documentation for a pattern type not covered (e.g., globstar `**` patterns)? They should find cross-references to gitignore documentation for advanced patterns.
- How does the documentation handle patterns that look similar but behave differently (e.g., `dist` vs `dist/` vs `/dist`)? Clear comparison tables should distinguish them.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Documentation MUST include a "Pattern Normalization" section in `docs/config-schema.md` explaining how user-written patterns are transformed internally.
- **FR-002**: Documentation MUST provide a transformation table showing input patterns and their normalized forms with explanations.
- **FR-003**: Documentation MUST expand the bare segment explanation to include what matches and what does NOT match, with explicit examples.
- **FR-004**: Documentation MUST include at least one negation example showing how to exclude a directory while keeping specific files.
- **FR-005**: Documentation MUST consolidate filter precedence information to one canonical location (`docs/config-schema.md`) with cross-references from other documents.
- **FR-006**: README MUST link to `docs/ARCHITECTURE.md` for detailed filter flow information.
- **FR-007**: Source code comments (`router/src/main.ts`, `router/src/diff.ts`) SHOULD reference the canonical documentation location rather than duplicating precedence details.

### Key Entities

- **Pattern**: A string written by users in `.reviewignore` files, transformed via normalization rules before matching.
- **Normalization Rule**: A transformation applied to patterns (bare name → `**/name`, trailing `/` → directory match, leading `/` → root-relative).
- **Filter Precedence**: The order in which filtering mechanisms are applied (`.reviewignore` → `path_filters.exclude` → `path_filters.include`).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can correctly predict pattern behavior for all 4 pattern types (bare, leading `/`, trailing `/`, path-relative) after reading documentation.
- **SC-002**: Documentation contains 3 or fewer locations mentioning filter precedence (down from 5), with all non-canonical locations containing cross-references.
- **SC-003**: All 3 documentation gaps identified in the review report are addressed with new content.
- **SC-004**: Users can successfully configure negation patterns for directory exclusion with file exceptions without external assistance.
- **SC-005**: Pattern normalization table covers all transformation rules with before/after examples.

## Assumptions

- Users have basic familiarity with `.gitignore` syntax since `.reviewignore` follows similar patterns.
- The existing implementation behavior is correct and documentation should describe current behavior, not propose changes.
- Removing redundant comments from source code files is optional and should be evaluated for impact on developer experience when reading code.
- Cross-references using relative markdown links will work correctly in both GitHub rendering and the documentation viewer.
