# Feature Specification: Review Team Documentation

**Feature Branch**: `001-review-team-docs`
**Created**: 2026-01-27
**Status**: Draft
**Input**: User description: "Create REVIEW_TEAM.md documentation with profiles and images for each review team member"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - View Review Team Overview (Priority: P1)

A visitor to the repository wants to quickly understand who makes up the AI review team and what each tool contributes to the code review process.

**Why this priority**: This is the primary purpose of the documentation - introducing the review team to users who want to understand the project's code review capabilities.

**Independent Test**: Can be tested by viewing `docs/REVIEW_TEAM.md` on GitHub and confirming all 5 team members are displayed with images and profiles that render correctly.

**Acceptance Scenarios**:

1. **Given** a user visits the REVIEW_TEAM.md file on GitHub, **When** the page loads, **Then** they see all 5 review team members (PR Agent, Semgrep, Review Dog, OpenCode, Ollama) with their images and profile descriptions
2. **Given** a user views the page on GitHub, **When** they scroll through the content, **Then** all images display at consistent, readable sizes without horizontal scrolling
3. **Given** a user views the page on a mobile device, **When** the page renders, **Then** images and text remain readable and properly formatted

---

### User Story 2 - Learn About Individual Team Members (Priority: P2)

A developer wants to understand what specific role each review tool plays so they can understand what kind of feedback to expect from each reviewer.

**Why this priority**: Provides deeper context beyond just knowing who the team members are.

**Independent Test**: Can be tested by reading each profile section and verifying it explains the tool's purpose and contribution to code review.

**Acceptance Scenarios**:

1. **Given** a user reads a team member profile, **When** they finish reading, **Then** they understand what that tool does and why it's part of the review team
2. **Given** a user is looking for a specific team member, **When** they scan the page, **Then** they can easily identify each member by their distinctive superhero image

---

### Edge Cases

- What happens when images fail to load? Alt text should describe each team member
- How does the page display on narrow screens? Images should scale appropriately
- What if a new team member is added later? Document structure should be extensible

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Documentation MUST include all 5 current review team members: PR Agent, Semgrep, Review Dog, OpenCode, and Ollama
- **FR-002**: Each team member MUST have their corresponding superhero image displayed
- **FR-003**: Each team member MUST have a short profile describing their role and contribution
- **FR-004**: Images MUST be sized appropriately for GitHub markdown rendering (recommended max width 200-300px to prevent oversized display)
- **FR-005**: All images MUST include descriptive alt text for accessibility
- **FR-006**: Documentation MUST be located at `docs/REVIEW_TEAM.md`
- **FR-007**: Images MUST be referenced using relative paths from the docs folder (`img/filename.png`)
- **FR-008**: Documentation MUST display the project banner (`odd-ai-reviewers-banner.png`, 1536x838) at the top of the page before team member profiles
- **FR-009**: Team members MUST be displayed in a card layout, with image on left and profile text on right for each member (profile-style presentation)
- **FR-010**: Each team member profile MUST include a clickable link to the tool's official GitHub repository
- **FR-011**: Documentation MUST include a closing "Why odd-ai-reviewers?" section after all team member profiles, using `oddessentials1.png` (1024x1536) image, explaining the value of the combined review team

### Key Entities

- **Team Member**: Represents each AI review tool with attributes: name, image path, profile description, specialty/role, GitHub repository URL
- **Review Team**: The collective group of 5 AI code review tools working together

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: All 5 team members are visible with images when viewing REVIEW_TEAM.md on GitHub
- **SC-002**: Images render at consistent, proportional sizes (not exceeding ~300px width) on GitHub
- **SC-003**: Page renders correctly on both desktop and mobile GitHub views
- **SC-004**: 100% of images have meaningful alt text descriptions
- **SC-005**: Document follows consistent formatting structure for all team member profiles

## Assumptions

- All 5 team member images already exist in `docs/img/` directory (verified: pr-agent.png, semgrep.png, review-dog.png, opencode.png, ollama.png)
- Images have varying native dimensions that will need HTML width attributes for consistent display:
  - Portrait images (1024x1536): pr-agent, review-dog, semgrep, ollama
  - Landscape image (1536x1024): opencode
- GitHub markdown supports HTML img tags with width/height attributes for controlling image size
- Short profiles (2-4 sentences) are sufficient for introducing each team member

## Image Inventory Verification

| Team Member                | Image File         | Dimensions | Status  |
| -------------------------- | ------------------ | ---------- | ------- |
| PR Agent                   | pr-agent.png       | 1024x1536  | Present |
| Semgrep                    | semgrep.png        | 1024x1536  | Present |
| Review Dog                 | review-dog.png     | 1024x1536  | Present |
| OpenCode                   | opencode.png       | 1536x1024  | Present |
| Ollama                     | ollama.png         | 1024x1536  | Present |
| odd-ai-reviewers (summary) | oddessentials1.png | 1024x1536  | Present |

**All 5 team members have corresponding images, plus the oddessentials summary image. No one is missing.**

## Clarifications

### Session 2026-01-27

- Q: Should a banner image be displayed at the top of the page? → A: Yes, use odd-ai-reviewers-banner.png at the top
- Q: How should team members be arranged on the page? → A: Card layout - image on left, profile text on right for each member
- Q: Should profiles include links to the tool's GitHub project? → A: Yes, include URL to each GitHub project in the profile
- Q: Should there be a summary section at the end? → A: Yes, add oddessentials1.png profile at end explaining why odd-ai-reviewers is useful given combined team strengths
