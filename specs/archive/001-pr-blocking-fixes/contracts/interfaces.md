# Contracts: PR Blocking Fixes

**Feature**: 001-pr-blocking-fixes
**Date**: 2026-02-03

## Overview

This feature does not introduce new APIs. This document captures the internal interface contracts affected by the changes for validation purposes.

## Internal Interfaces

### isNodeError Type Guard

```typescript
/**
 * Type guard for Node.js errors with errno code property.
 * Use this before accessing .code on caught exceptions.
 *
 * @param err - The caught error (unknown type)
 * @returns true if err is an Error with a 'code' property
 */
function isNodeError(err: unknown): err is NodeJS.ErrnoException;

// Contract:
// - MUST return true only if err instanceof Error AND 'code' in err
// - MUST NOT throw
// - MUST handle null, undefined, primitives, objects without Error prototype
```

### isModernOpenAIModel Detector

```typescript
/**
 * Detects if a model name indicates a modern OpenAI model
 * that requires max_completion_tokens instead of max_tokens.
 *
 * @param model - The OpenAI model name (e.g., "gpt-4o", "gpt-5-turbo")
 * @returns true if the model requires max_completion_tokens
 */
function isModernOpenAIModel(model: string): boolean;

// Contract:
// - MUST return true for models starting with: gpt-5, o1, o3
// - MUST return false for models starting with: gpt-4, gpt-3.5
// - MUST NOT throw
// - MUST be case-sensitive (model names are lowercase)
```

### Agent Environment Builder Extension

```typescript
/**
 * Builds environment variables for agent subprocess execution.
 * Extended to include PYTHONUTF8=1 for Python-based agents.
 *
 * @param agentId - The agent identifier
 * @param baseEnv - The base environment from context
 * @returns Environment object safe for subprocess
 */
function buildAgentEnv(
  agentId: string,
  baseEnv: Record<string, string | undefined>
): Record<string, string | undefined>;

// Contract (existing + extension):
// - MUST NOT include provider tokens (GITHUB_TOKEN, ADO_PAT, etc.)
// - MUST include PYTHONUTF8='1' when agentId is 'semgrep'
// - MUST NOT modify the input baseEnv object
// - MUST return a new object (defensive copy)
```

## Workflow Contracts

### release.yml Version Extraction

```yaml
# Contract: Version extraction MUST use shell parameter expansion
# Input: Git tag like "v1.2.3"
# Output: Version string "1.2.3"

# Implementation:
TAG=$(git describe --tags --abbrev=0)
TAG_VERSION=${TAG#v}
# Contract guarantees:
# - MUST NOT use sed, awk, or other external commands
# - MUST handle tags with/without 'v' prefix
# - MUST NOT be vulnerable to shell injection from tag content
```

### badge-update.yml Gist Update

```yaml
# Contract: Gist updates MUST use official GitHub actions only
# Input: JSON badge data file
# Output: Updated Gist content

# Implementation MUST use one of:
# 1. actions/github-script@v7 with Octokit
# 2. Pinned SHA of approved third-party action

# Contract guarantees:
# - MUST NOT use unpinned third-party actions
# - Secrets MUST only flow through approved action inputs
```

## Validation Criteria

| Interface           | Test Type | Validation                                            |
| ------------------- | --------- | ----------------------------------------------------- |
| isNodeError         | Unit      | Test with Error, non-Error, objects with/without code |
| isModernOpenAIModel | Unit      | Test model name patterns                              |
| buildAgentEnv       | Unit      | Verify PYTHONUTF8 presence for semgrep                |
| Version extraction  | Workflow  | Dry-run release with test tags                        |
| Gist update         | Workflow  | Manual workflow dispatch test                         |
