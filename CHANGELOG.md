# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **maxNodesVisited guardrail**: Added configurable limit on CFG nodes visited per traversal (default: 10,000). Analysis returns `classification: 'unknown'` when limit is exceeded, preventing runaway analysis on complex code.
- **Spec-to-test traceability**: Added `pnpm spec:linkcheck` command and CI integration to validate that test file references in spec.md files exist. Prevents link rot in specifications.
- **Logging field standardization**: Added canonical field names with documented deprecation timeline.

### Changed

- **Logging field names** (backward compatible): Log entries now emit both canonical and deprecated field names during Phase 1 transition period.

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
