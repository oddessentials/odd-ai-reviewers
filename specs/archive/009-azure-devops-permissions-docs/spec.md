# Feature Specification: Azure DevOps Build Agent Permissions Documentation

**Feature Branch**: `009-azure-devops-permissions-docs`
**Created**: 2026-01-29
**Status**: Draft
**Input**: User description: "Document well that azure devops requires 'Contribute - Allow' & 'Contribute to pull requests - Allow' permissions on the build agent for the project or repo."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - DevOps Engineer Configuring Build Agent (Priority: P1)

A DevOps engineer is setting up the odd-ai-reviewers tool in an Azure DevOps pipeline for the first time. They need to understand what permissions are required for the build agent identity before the tool can successfully post PR review comments.

**Why this priority**: Without proper permissions, the tool will fail silently or with cryptic errors, making this the most critical information for successful adoption.

**Independent Test**: Can be fully tested by a new user following the documentation to configure permissions and successfully running a PR review that posts comments.

**Acceptance Scenarios**:

1. **Given** a DevOps engineer reading the documentation, **When** they navigate to README → Azure DevOps Setup → Permissions or use Ctrl+F with listed search terms, **Then** they find clear permission requirements within 30 seconds.
2. **Given** a build agent without configured permissions, **When** the engineer follows the documented steps, **Then** the build agent has the correct "Contribute" and "Contribute to pull requests" permissions enabled.
3. **Given** a properly configured build agent, **When** the tool runs in a PR pipeline, **Then** it successfully posts review comments to the pull request.

---

### User Story 2 - Developer Troubleshooting Permission Errors (Priority: P2)

A developer encounters permission-related errors when the tool attempts to post comments to a pull request. They need to quickly diagnose whether the issue is a permissions problem and understand how to resolve it.

**Why this priority**: After initial setup, troubleshooting is the next most common need, helping users self-serve without support requests.

**Independent Test**: Can be fully tested by simulating a permissions error and verifying the documentation guides the user to the solution.

**Acceptance Scenarios**:

1. **Given** a developer seeing a TF401027, TF401444, or REST API authorization error, **When** they search the documentation for troubleshooting, **Then** they find a symptom-to-fix table that maps their specific error to the required permission(s).
2. **Given** the troubleshooting guide, **When** following the verification steps, **Then** the developer can confirm whether permissions are correctly configured.

---

### User Story 3 - Repository Administrator Granting Permissions (Priority: P2)

A repository administrator needs to grant the build agent identity the required permissions at either the project level or repository level. They need step-by-step instructions with clear descriptions of the Azure DevOps UI.

**Why this priority**: Admins may not be familiar with the tool itself but need precise instructions to delegate permissions correctly.

**Independent Test**: Can be fully tested by an admin following the guide to grant permissions without prior knowledge of the tool.

**Acceptance Scenarios**:

1. **Given** an administrator with project settings access, **When** they follow the documentation, **Then** they can navigate to the correct Azure DevOps settings page.
2. **Given** the permissions settings page, **When** following the documentation, **Then** the administrator can identify the build agent identity and grant both required permissions.
3. **Given** multiple repositories in a project, **When** the admin reads the documentation, **Then** they understand whether to apply permissions at project level or per-repository level.

---

### Edge Cases

- What happens when the pipeline uses a non-default identity type (e.g., self-hosted agent service account or PAT user instead of Build Service)?
- User has correct permissions but confuses PR comment posting with branch policy bypass (e.g., expecting to merge without required reviewers).
- What if the organization has custom security policies that override repository-level permissions?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Documentation MUST clearly state that the build agent requires "Contribute - Allow" permission on the target repository or project.
- **FR-002**: Documentation MUST clearly state that the build agent requires "Contribute to pull requests - Allow" permission on the target repository or project.
- **FR-003**: Documentation MUST explain where these permissions can be configured (Project Settings > Repositories > Security).
- **FR-004**: Documentation MUST identify all four pipeline identity types that may require permissions:
  - Project Collection Build Service (OrgName)
  - {ProjectName} Build Service (OrgName)
  - Self-hosted agent service account
  - Service connection or PAT-authenticated user
- **FR-004a**: Documentation MUST include a decision tree or flowchart to help users identify which identity type applies to their pipeline configuration.
- **FR-005**: Documentation MUST include step-by-step instructions for granting permissions.
- **FR-006**: Documentation MUST include a troubleshooting section with symptom-to-fix mapping for common permission-related errors, including:
  - TF401027 ("not authorized to access this resource")
  - TF401444 ("access denied")
  - REST API errors mentioning "PullRequestThread"
  - REST API errors mentioning "Git Repositories" authorization
  - Each error mapped to the specific permission(s) that resolve it
- **FR-007**: Documentation MUST explain the difference between project-level and repository-level permission assignment, including:
  - Decision rule: "If pipeline runs across multiple repos in the same project, grant at project-level; otherwise repo-level is least-privilege"
  - Warning that repo-level permissions can be overridden by inherited project-level deny policies
  - Note that organization-level security policies may also override repository settings
  - How to check effective permissions when inheritance is involved
- **FR-008**: Documentation MUST include explicit scope statement: "These permissions enable PR thread/comment posting; they do NOT bypass branch policies (merge restrictions, required reviewers, linked work items, etc.)"
- **FR-009**: Documentation MUST include a step-by-step verification checklist:
  1. Open Project Settings → Repositories → Security
  2. Search for the exact identity name (per FR-004 identity types)
  3. Confirm "Contribute" shows "Allow" (not "Not set" or "Inherited Deny")
  4. Confirm "Contribute to pull requests" shows "Allow" (not "Not set" or "Inherited Deny")
  5. If inheritance is involved, verify effective permissions resolve to "Allow"
- **FR-010**: Documentation MUST be placed in a guaranteed, discoverable location (e.g., README → Azure DevOps Setup → Permissions) with troubleshooting mirrored in docs/troubleshooting.md.
- **FR-011**: Documentation MUST include a "Search terms" line listing key phrases for Ctrl+F discoverability: "Contribute to pull requests", "Build Service", "Project Collection Build Service", "TF401027", "TF401444".

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: New users can configure build agent permissions correctly on first attempt by following the documentation, with a target success rate of 90%.
- **SC-002**: Users experiencing permission errors can self-diagnose and resolve the issue within 10 minutes using the troubleshooting guide.
- **SC-003**: Documentation includes all required permission names with their exact Azure DevOps UI labels for easy identification.
- **SC-004**: Zero ambiguity in permission requirements - both "Contribute" and "Contribute to pull requests" are explicitly named and explained.

## Clarifications

### Session 2026-01-29

- Q: Which pipeline identity types should be documented? → A: All four identity types (Project Collection Build Service, {Project} Build Service, self-hosted agent service account, service connection/PAT user) with "how to identify which applies to you" decision tree.
- Q: Should the docs include a concrete scope decision rule for project vs. repo-level? → A: Yes, include decision rule ("multi-repo pipeline → project-level; single-repo → repo-level for least-privilege") PLUS callout that repo-level can be overridden by inherited/project-level deny policies.
- Q: Should docs clarify what these permissions do NOT enable (branch policies)? → A: Yes, add explicit statement: "These permissions enable PR thread/comment posting; they do NOT bypass branch policies (merge restrictions, required reviewers, linked work items, etc.)"
- Q: Should troubleshooting include specific ADO error strings mapped to fixes? → A: Yes, include 3-5 common error strings/codes (TF401027, TF401444, "PullRequestThread" REST errors, "Git Repositories" auth failures) mapped to the specific permission(s) that resolve each.
- Q: Should docs include a step-by-step verification checklist? → A: Yes, include: "Open Project Settings → Repos → Security → search exact identity name → confirm both permissions show 'Allow' (not 'Not set' or 'Inherited Deny') → verify effective permissions if inheritance involved"

## Assumptions

- Users have administrative access to Azure DevOps project or repository settings (or can request it from someone who does).
- Users are familiar with basic Azure DevOps navigation.
- The documentation will be placed in README under "Azure DevOps Setup → Permissions" with troubleshooting mirrored in docs/troubleshooting.md.
- Users may be using any of the four supported identity types; the decision tree will help them identify which applies.
