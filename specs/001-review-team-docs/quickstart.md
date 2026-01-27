# Quickstart: Review Team Documentation

**Feature**: 001-review-team-docs

## Overview

Create `docs/REVIEW_TEAM.md` with banner, 5 team member profile cards, and closing summary section.

## File to Create

| Path                  | Description                      |
| --------------------- | -------------------------------- |
| `docs/REVIEW_TEAM.md` | Team member profiles with images |

## Implementation Steps

### 1. Create REVIEW_TEAM.md

Create the file at `docs/REVIEW_TEAM.md` with the following structure:

```markdown
# The Review Team

<img src="img/odd-ai-reviewers-banner.png" alt="odd-ai-reviewers banner" width="100%">

Meet the AI-powered code review team...

[Team member cards - see pattern below]
```

### 2. Card Layout Pattern

For each team member, use this HTML table pattern:

```html
<table>
  <tr>
    <td width="200">
      <img src="img/[tool-name].png" width="200" alt="[descriptive alt text]" />
    </td>
    <td valign="top">
      <h3>[Tool Name]</h3>
      <em>[Role/Tagline]</em>
      <p>[2-3 sentence description]</p>
      <p><a href="[github-url]">View on GitHub</a></p>
    </td>
  </tr>
</table>
```

### 3. Team Members (Alphabetical Order)

| Tool       | Image                | GitHub URL                              |
| ---------- | -------------------- | --------------------------------------- |
| Ollama     | `img/ollama.png`     | https://github.com/ollama/ollama        |
| OpenCode   | `img/opencode.png`   | https://github.com/opencode-ai/opencode |
| PR Agent   | `img/pr-agent.png`   | https://github.com/Codium-ai/pr-agent   |
| Review Dog | `img/review-dog.png` | https://github.com/reviewdog/reviewdog  |
| Semgrep    | `img/semgrep.png`    | https://github.com/semgrep/semgrep      |

### 4. Closing Summary Section

After all team member profiles, add a "Why odd-ai-reviewers?" section:

```html
<table>
  <tr>
    <td width="200">
      <img
        src="img/oddessentials1.png"
        width="200"
        alt="odd-ai-reviewers - the unified AI review team"
      />
    </td>
    <td valign="top">
      <h3>Why odd-ai-reviewers?</h3>
      <p>
        [Explain the combined value of having all 5 tools working together in a unified pipeline.
        Highlight how each tool's strengths complement the others.]
      </p>
      <p>
        <a href="https://github.com/oddessentials/odd-ai-reviewers"
          >View odd-ai-reviewers on GitHub</a
        >
      </p>
    </td>
  </tr>
</table>
```

### 5. Verification

After creating the file:

1. View on GitHub to verify images render correctly
2. Check mobile view for responsive behavior
3. Verify alt text is present on all images
4. Verify all GitHub links are clickable and point to correct repositories
5. Verify the closing summary section renders correctly with oddessentials1.png

## Dependencies

- All images already exist in `docs/img/`
- No code changes required
- No build steps needed
