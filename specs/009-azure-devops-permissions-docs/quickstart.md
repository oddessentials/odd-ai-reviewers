# Quickstart: Azure DevOps Permissions Documentation

**Feature**: 009-azure-devops-permissions-docs
**Type**: Documentation Update

## Overview

This quickstart outlines the documentation changes required to implement the Azure DevOps permissions documentation feature.

## Files to Modify

### 1. Primary: `docs/platforms/azure-devops/setup.md`

**Current Section 4 (lines ~60-78)** - Expand with:

```markdown
### 4. Configure Repository Permissions

> [!IMPORTANT]
> This step is **required** for PR commenting. The pipeline identity needs both
> "Contribute" and "Contribute to pull requests" permissions.

#### Required Permissions

| Permission                      | Purpose                          |
| ------------------------------- | -------------------------------- |
| **Contribute**                  | Required for Git operations      |
| **Contribute to pull requests** | Required for posting PR comments |

#### Identify Your Pipeline Identity

[Decision tree from research.md Section 7]

#### Granting Permissions

[Step-by-step instructions]

#### Verification Checklist

[Checklist from research.md Section 6]

#### Scope Decision Guide

[Decision rule: multi-repo → project-level; single-repo → repo-level]
[Inheritance warning]

#### What These Permissions Do NOT Enable

> [!NOTE]
> These permissions enable PR thread/comment posting; they do NOT bypass
> branch policies (merge restrictions, required reviewers, linked work items, etc.)
```

**Troubleshooting Section (~lines 139-178)** - Expand with:

```markdown
## Troubleshooting

### Permission Error Reference

| Error Code | Message Pattern                                       | Resolution                         |
| ---------- | ----------------------------------------------------- | ---------------------------------- |
| TF401027   | "You need the Git 'PullRequestContribute' permission" | Grant both Contribute permissions  |
| TF401444   | "Please sign-in at least once"                        | Identity needs first web login     |
| 403        | "PullRequestThread" unauthorized                      | Check token scope and permissions  |
| 401        | General unauthorized                                  | Verify Authorization header format |

[Detailed resolution steps for each]

### Search Terms

For quick navigation, search for:

- `Contribute to pull requests`
- `Build Service`
- `Project Collection Build Service`
- `TF401027`
- `TF401444`
```

### 2. New: `docs/troubleshooting.md`

Central troubleshooting hub that links to platform-specific sections:

```markdown
# Troubleshooting Guide

Quick links to common issues by platform.

## Azure DevOps

### Permission Errors

- [TF401027 - Permission Required](platforms/azure-devops/setup.md#tf401027-permission-required)
- [TF401444 - First Login Required](platforms/azure-devops/setup.md#tf401444-first-login-required)
- [403 Unauthorized](platforms/azure-devops/setup.md#403-unauthorized)

### Quick Fix Checklist

1. Verify both "Contribute" and "Contribute to pull requests" are set to Allow
2. Check identity type matches your pipeline configuration
3. Verify no Inherited Deny blocks access

## GitHub

[Link to GitHub troubleshooting]

## Search Terms

`Contribute to pull requests`, `Build Service`, `Project Collection Build Service`,
`TF401027`, `TF401444`, `GITHUB_TOKEN`, `permissions`
```

## Implementation Order

1. **Update `docs/platforms/azure-devops/setup.md`**
   - Expand Section 4 with complete permission requirements
   - Add identity decision tree
   - Add verification checklist
   - Expand troubleshooting with error code table
   - Add search terms section

2. **Create `docs/troubleshooting.md`**
   - Central hub linking to platform-specific troubleshooting
   - Mirrors key ADO permission content for discoverability

3. **Verify links work**
   - Test internal anchor links
   - Verify cross-file references

## Content Sources

All content derived from:

- `specs/009-azure-devops-permissions-docs/research.md` - Error codes, identity types, verification steps
- `specs/009-azure-devops-permissions-docs/spec.md` - FR-001 through FR-011 requirements

## Validation

After implementation, verify:

- [ ] FR-001: "Contribute - Allow" clearly stated
- [ ] FR-002: "Contribute to pull requests - Allow" clearly stated
- [ ] FR-003: Navigation path documented (Project Settings > Repositories > Security)
- [ ] FR-004: All four identity types documented
- [ ] FR-004a: Decision tree/flowchart present
- [ ] FR-005: Step-by-step instructions present
- [ ] FR-006: Error mapping table with TF401027, TF401444, REST errors
- [ ] FR-007: Scope decision rule with inheritance warning
- [ ] FR-008: Branch policy clarification statement
- [ ] FR-009: Verification checklist with 5 steps
- [ ] FR-010: Content in discoverable location (setup.md + troubleshooting.md)
- [ ] FR-011: Search terms section present
