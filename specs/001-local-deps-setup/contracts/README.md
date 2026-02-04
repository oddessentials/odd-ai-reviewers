# Contracts: CLI Local Review Dependency Setup

**Feature**: 001-local-deps-setup
**Date**: 2026-02-02

## API Contracts

This feature is an internal CLI enhancement with no external API surface. There are no OpenAPI or GraphQL contracts to define.

## Internal Interfaces

The key internal interfaces are documented in [data-model.md](../data-model.md):

- `ExternalDependency` - Catalog entry structure
- `DependencyCheckResult` - Single dependency check result
- `DependencyCheckSummary` - Aggregated check results

## CLI Contract

### `ai-review check` Command

**Input**: None (uses loaded config)

**Options**:

- `--verbose`: Show detailed version information
- `--json`: Output as JSON

**Output (default)**:

```text
✓ semgrep (1.56.0)
✓ reviewdog (0.17.4)

All dependencies available.
```

**Output (--json)**:

```json
{
  "results": [
    { "name": "semgrep", "status": "available", "version": "1.56.0", "error": null },
    { "name": "reviewdog", "status": "available", "version": "0.17.4", "error": null }
  ],
  "hasBlockingIssues": false,
  "hasWarnings": false
}
```

**Exit Codes**:

- `0`: All dependencies available (or only optional missing)
- `1`: Required dependency missing
- `2`: Invalid arguments

## Stability Guarantees

- Exit code semantics are stable
- JSON output schema (`DependencyCheckSummary`) is stable
- Human-readable output format may change between versions
