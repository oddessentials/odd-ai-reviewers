# Research: Review Team Documentation

**Feature**: 001-review-team-docs
**Date**: 2026-01-27

## Research Tasks

### 1. GitHub Markdown Card Layout Patterns

**Decision**: Use HTML tables for card layout (image left, text right)

**Rationale**:

- GitHub Flavored Markdown (GFM) does not support CSS or flexbox
- HTML tables render reliably in GitHub markdown files
- Using `<table>` with `<td>` allows precise control of image width and text alignment
- `valign="top"` ensures text aligns to top of cell when image is taller

**Alternatives Considered**:

- Pure markdown with inline images: Does not support side-by-side layout
- HTML `<div>` with float/flex: CSS styles stripped by GitHub sanitizer
- Markdown tables with image syntax: Limited control over sizing

**Implementation Pattern**:

```html
<table>
  <tr>
    <td width="200">
      <img src="img/member.png" width="200" alt="Member Name" />
    </td>
    <td valign="top">
      <h3>Member Name</h3>
      <p>Profile description text...</p>
    </td>
  </tr>
</table>
```

### 2. Image Sizing for GitHub

**Decision**: Use `width="200"` attribute for team member images, full width for banner

**Rationale**:

- Native images are large (1024x1536 portrait, 1536x1024 landscape)
- Without sizing, images render at full size causing horizontal scroll
- 200px width provides consistent card appearance
- Portrait images (4 of 5) will be ~300px tall at 200px width
- Landscape image (opencode) will be ~133px tall at 200px width - acceptable variance
- Banner should span content width for visual impact

**Alternatives Considered**:

- 150px width: Too small for detail visibility
- 250px width: Takes too much horizontal space, less room for text
- Percentage width: Inconsistent across viewport sizes

### 3. Team Member Profile Content

**Decision**: Each profile includes name, role/specialty, and 2-3 sentence description

**Rationale**:

- Keeps profiles scannable
- Consistent structure aids comparison
- Superhero theme already conveyed by images

**Profile Structure**:

- **Name**: Tool name (e.g., "PR Agent")
- **Role**: One-line specialty (e.g., "The Code Review Commander")
- **Description**: 2-3 sentences about what the tool does and why it's valuable
- **GitHub Link**: URL to official repository

**GitHub Repository URLs**:

- Ollama: https://github.com/ollama/ollama
- OpenCode: https://github.com/opencode-ai/opencode
- PR Agent: https://github.com/Codium-ai/pr-agent
- Review Dog: https://github.com/reviewdog/reviewdog
- Semgrep: https://github.com/semgrep/semgrep

### 4. Team Member Order

**Decision**: Order alphabetically by tool name for predictability

**Rationale**:

- No inherent priority among tools
- Alphabetical order is easy to maintain
- Users can scan predictably

**Order**: Ollama, OpenCode, PR Agent, Review Dog, Semgrep, followed by "Why odd-ai-reviewers?" summary section

### 5. Alt Text Strategy

**Decision**: Descriptive alt text including superhero character and tool association

**Rationale**:

- Accessibility requirement (FR-005)
- Should convey visual content for screen readers
- Include both character type and tool name

**Example**: `alt="PR Agent superhero - a badger in a purple cape holding a laptop"`

### 6. Closing Summary Section

**Decision**: Include "Why odd-ai-reviewers?" section at end with oddessentials1.png image

**Rationale**:

- Summarizes the value proposition of the combined review team
- Explains why using this repo is better than individual tools alone
- Uses same card layout as team member profiles for visual consistency
- Image (oddessentials1.png, 1024x1536) matches portrait orientation of most team members

**Content Focus**:

- Combined strengths of all 5 tools working together
- Value of integrated AI code review pipeline
- Link to odd-ai-reviewers repository

## Summary

All technical decisions resolved. No blockers for Phase 1.
