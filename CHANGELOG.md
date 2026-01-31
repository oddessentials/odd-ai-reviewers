# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Type System & Safety (010-type-test-optimization, 011-agent-result-unions)

- **Custom error types**: Added `ConfigError`, `AgentError`, `NetworkError`, and `ValidationError` with canonical wire format for consistent error handling and serialization across all modules.
- **Result type pattern**: Implemented `Result<T, E>` discriminated union for explicit error handling with `Ok()` and `Err()` constructors.
- **Branded types**: Added compile-time validation guarantees with `SafeGitRef`, `ValidatedConfig<T>`, and `CanonicalPath` types, including `parse`/`brand`/`unbrand` helpers.
- **assertNever utility**: Added exhaustive switch enforcement utility to catch missing cases at compile time.
- **AgentResult discriminated unions**: Refactored agent results to use `status: 'success' | 'failure' | 'skipped'` discriminated union with `AgentSuccess`, `AgentFailure`, and `AgentSkipped` constructor functions.
- **Typed metadata helpers**: Added type-safe accessors for `Finding.metadata` and `AgentContext.env` fields.

#### Cache & Reliability (012-fix-agent-result-regressions)

- **Cache schema versioning**: Added `CACHE_SCHEMA_VERSION` constant for cache key generation, ensuring legacy entries are automatically invalidated on schema changes.
- **Partial findings support**: `AgentResultFailure` now carries `partialFindings` array with `provenance: 'partial'` field, preserving findings from agents that fail mid-execution.
- **Cache validation**: Cache retrieval validates entries via `AgentResultSchema.safeParse()`, treating invalid entries as cache misses rather than runtime failures.
- **BrandHelpers.is() consistency**: Implemented `.is()` as `isOk(parse(x))` to ensure perfect consistency between type guards and parse functions.

#### Control Flow Analysis (001-fix-feedback-bugs)

- **maxNodesVisited guardrail**: Added configurable limit on CFG nodes visited per traversal (default: 10,000). Analysis returns `classification: 'unknown'` when limit is exceeded, preventing runaway analysis on complex code.
- **Spec-to-test traceability**: Added `pnpm spec:linkcheck` command and CI integration to validate that test file references in spec.md files exist.

#### Reporting & Deduplication (405-fix-grouped-comment-resolution, 406-fix-remaining-bugs)

- **Grouped comment resolution**: Fixed resolution logic to check all unique fingerprint markers within a grouped comment before marking it as resolved. A grouped comment is only resolved when ALL findings are stale.
- **Partial resolution visual indication**: Resolved findings within unresolved grouped comments are visually distinguished with Markdown strikethrough while preserving fingerprint markers.
- **Proximity-based deduplication**: Added proximity map updates after posting comments to prevent duplicate comments within the same run for findings with the same fingerprint within 20 lines.
- **Resolution logging**: Added structured `comment_resolution` log events with consistent fields across GitHub and Azure DevOps.

#### Build & Tooling (007-pnpm-timeout-telemetry)

- **pnpm migration**: Migrated from npm to pnpm as the sole supported package manager with Corepack integration.
- **Timeout telemetry**: Added timeout event emission with JSONL backend for diagnosing slow or stuck operations.
- **npm preinstall guard**: Added guard that blocks `npm install` and `npm ci` while allowing harmless commands like `npm --version`.
- **Worker-thread timeout design**: Added architecture documentation for future preemptive timeout implementation.

#### Documentation (008-docs-viewer-refactor, 009-azure-devops-permissions-docs)

- **Live reload dev server**: Added `pnpm dev` command for documentation viewer with SSE-based live reload on file changes.
- **Documentation landing page**: Changed viewer to render `docs/index.md` as default landing page instead of statistics display.
- **Azure DevOps permissions guide**: Expanded Azure DevOps documentation with complete permissions setup, error code reference, and troubleshooting guide.
- **Cross-platform troubleshooting hub**: Created unified troubleshooting documentation accessible from all platform-specific guides.

### Fixed

#### Critical Bug Fixes (001-fix-feedback-bugs)

- **Node visit limit off-by-one**: Fixed comparison operator from `>` to `>=` ensuring exactly N nodes are visited when limit is set to N (pre-increment check semantics).
- **Vulnerability mitigation mapping**: Fixed `pathMitigatesVulnerability()` to verify mitigations actually apply to the specific vulnerability type, preventing false negatives where real vulnerabilities were incorrectly suppressed.
- **Spec link checker path extraction**: Fixed regex to use global matching for all test coverage paths on a line, not just the first two capture groups.

#### Reporting Fixes (405-fix-grouped-comment-resolution, 406-fix-remaining-bugs)

- **Grouped comment resolution**: Fixed bug where entire grouped comments were marked resolved when only some findings were stale, causing active security findings to be hidden.
- **Duplicate comments within same run**: Fixed proximity map not being updated after posting comments, allowing near-duplicate comments to slip through.
- **Deleted file filtering**: Fixed path normalization mismatch between deleted files set and finding paths, ensuring findings on deleted files are properly filtered.
- **Empty marker rejection**: Added guard to reject empty strings during fingerprint marker extraction.
- **User content preservation**: Fixed visual distinction to preserve all non-marker user-authored content when applying strikethrough to resolved findings.

#### Cache Fixes (012-fix-agent-result-regressions)

- **Legacy cache entry handling**: Fixed runtime crashes when encountering pre-migration cache entries by treating schema validation failures as cache misses.
- **Path traversal defense**: Hardened cache key validation and path traversal defenses in cache operations.

#### Security Fixes

- **Shell injection hardening**: Hardened shell injection defenses across security-sensitive code paths.
- **pnpm bin resolution**: Added `shell:false` in pnpm bin resolution to prevent command injection.
- **CVE-2026-24842 remediation**: Updated dependencies to address security vulnerability.

#### Documentation Viewer Fixes (008-docs-viewer-refactor)

- **Relative markdown links**: Fixed link resolution to correctly handle relative paths like `./x.md` and `../x.md`.
- **Image path resolution**: Fixed image paths to resolve relative to current document.
- **Anchor-only hashes**: Fixed handling of anchor-only hash links within documents.
- **Windows compatibility**: Fixed file watcher path normalization for Windows systems.
- **Base path compatibility**: Fixed viewer to work correctly under GitHub Pages subpaths using relative path fetches.

### Changed

- **Logging field standardization**: Log entries now emit canonical field names alongside deprecated names during transition period.
- **Stale count calculation**: Simplified stale count calculation to use clear, single ternary expression for maintainability.
- **ADO path documentation**: Added documentation clarifying intentional difference between ADO API paths (leading slash) and deduplication paths (normalized).
- **Cache entry handling**: Changed to immutable updates (spread operator) when storing validated cache entries in memory.
- **Husky hooks**: Updated hooks to use `pnpm exec` for Windows PATH compatibility.
- **Docker configuration**: Updated Dockerfile to use pnpm instead of npm.

### Deprecated

The following log field names are deprecated and will be removed in the next release:

| Deprecated Field    | Canonical Field         | Context                    |
| ------------------- | ----------------------- | -------------------------- |
| `pattern`           | `patternId`             | Pattern evaluation logs    |
| `elapsedMs`         | `durationMs`            | Timing measurements        |
| `file`              | `filePath`              | File path references       |
| `mitigationFile`    | `filePath`              | Cross-file mitigation logs |
| `vulnerabilityFile` | `vulnerabilityFilePath` | Cross-file mitigation logs |

**Migration Guide**: Update any log consumers to use canonical field names. Both old and new field names are currently emitted for backward compatibility.

## [1.0.0] - Initial Release

### Added

- Control flow analysis agent with mitigation pattern recognition
- ReDoS prevention with pattern validation
- Cross-file mitigation tracking
- Structured logging with correlation IDs
- Budget management with graceful degradation
- GitHub and Azure DevOps PR comment integration
- Multi-agent review pipeline with caching
- Configurable review passes with agent orchestration
