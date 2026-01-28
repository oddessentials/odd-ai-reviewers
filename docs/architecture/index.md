# Architecture

Technical documentation covering the design, security model, and operational principles of odd-ai-reviewers.

## In This Section

| Document                      | Description                                             |
| ----------------------------- | ------------------------------------------------------- |
| [Overview](./overview.md)     | Execution flow, component architecture, and diagrams    |
| [Security](./security.md)     | Trust model, threat mitigation, and security boundaries |
| [Invariants](./invariants.md) | Non-negotiable design constraints and principles        |
| [Scope](./scope.md)           | Project boundaries and explicit non-goals               |

## Key Concepts

### Router Architecture

The router is the central orchestrator that:

- Validates configuration and API keys
- Enforces budget and resource limits
- Coordinates agent execution
- Aggregates and deduplicates findings
- Posts results to the PR

### Multi-Pass Review

Reviews happen in passes:

1. **Static Pass** - Free tools (Semgrep, Reviewdog) run first
2. **Semantic Pass** - AI agents analyze the diff
3. **Deduplication** - Findings are merged and prioritized
4. **Reporting** - Results posted as PR comments and annotations

## Quick Links

- [Execution Flow Diagrams →](./overview.md)
- [Trust Model →](./security.md)
- [Design Principles →](./invariants.md)
