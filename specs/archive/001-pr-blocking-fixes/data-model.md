# Data Model: PR Blocking Fixes

**Feature**: 001-pr-blocking-fixes
**Date**: 2026-02-03

## Overview

This feature consists of bug fixes and hardening changes. No new entities are introduced. This document captures the minimal data structures affected by the changes.

## Modified Structures

### Agent Environment Extension

The agent environment passed to external tool processes is extended with a new optional property:

```typescript
// Existing structure in buildAgentEnv()
interface AgentEnvironment extends Record<string, string | undefined> {
  // Existing properties...

  // NEW: Added for Semgrep Windows compatibility (FR-005)
  PYTHONUTF8?: '1';
}
```

**Validation**: String literal '1' only
**Lifecycle**: Set at agent spawn time, not persisted

### OpenAI Request Parameters (Model-Aware)

The OpenAI chat completion request uses conditional parameters based on model version:

```typescript
// Conditional parameter selection (FR-007/008/009)
type TokenLimitParam =
  | { max_tokens: number } // GPT-4.x and earlier
  | { max_completion_tokens: number }; // GPT-5.x and newer

// Model detection
function isModernOpenAIModel(model: string): boolean {
  return model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3');
}
```

**Rationale**: OpenAI API evolved; newer models reject `max_tokens`

### Error Type Guard

New utility function for safe error property access:

```typescript
// Type guard for Node.js errors with code property (FR-010/012)
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
```

**Usage**: All catch blocks handling filesystem or child_process errors

## Configuration Changes

### .releaserc.json Schema (No Change)

The semantic-release configuration schema remains unchanged. Only path values are corrected:

| Property                                    | Before                                           | After                                     |
| ------------------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| `@semantic-release/changelog.changelogFile` | `router/CHANGELOG.md`                            | `CHANGELOG.md`                            |
| `@semantic-release/git.assets`              | `["router/package.json", "router/CHANGELOG.md"]` | `["router/package.json", "CHANGELOG.md"]` |

## No New Entities

This feature does not introduce:

- New database tables/collections
- New API endpoints
- New file formats
- New configuration schemas

All changes are corrections or hardening of existing structures.
