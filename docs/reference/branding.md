# Branding Customization for Odd AI Reviewer

## Current State

Currently, all PR comments and check runs posted by the AI reviewer appear as **"github-actions [bot]"** with the GitHub logo.

This is because the workflow uses `GITHUB_TOKEN` (auto-provided by GitHub Actions), which is always attributed to `github-actions[bot]`.

---

## User Review Required

> [!IMPORTANT] > **Custom branding requires creating a GitHub App.** This is the only supported way to achieve a custom name and avatar for actions posted via GitHub's API. This involves setup steps outside this repository.

---

## Options Analysis

| Approach                      | Custom Name         | Custom Avatar         | Effort | Security               |
| ----------------------------- | ------------------- | --------------------- | ------ | ---------------------- |
| **GitHub App** (recommended)  | ✅ Yes              | ✅ Yes                | Medium | ✅ Best isolation      |
| Personal Access Token (PAT)   | ❌ Uses user's name | ❌ Uses user's avatar | Low    | ⚠️ Requires shared PAT |
| Keep current (`GITHUB_TOKEN`) | ❌ No               | ❌ No                 | None   | ✅ Already done        |

**Recommendation:** Create a **GitHub App** named "Odd AI Reviewer" with your custom logo.

---

## Proposed Changes: Create a GitHub App

### 1. Create the GitHub App (Manual Steps)

1. Go to your GitHub organization settings → **Developer settings** → **GitHub Apps** → **New GitHub App**
2. Configure:
   - **Name**: `Odd AI Reviewer` (or your preferred name—this is what appears on comments)
   - **Avatar/Logo**: Upload your logo (**minimum 200×200 pixels**, square PNG or JPG recommended)
   - **Homepage URL**: `https://github.com/oddessentials/odd-ai-reviewers` (or your docs)
   - **Webhook**: Disable (uncheck "Active")
   - **Permissions**:
     - `contents: read` (to read repository files)
     - `pull_requests: write` (to post PR comments)
     - `checks: write` (to create check runs)
   - **Where can this app be installed?**: `Only on this account` (or organization)
3. Click **Create GitHub App**
4. After creation:
   - Note the **App ID** (visible on the app settings page)
   - Generate a **Private Key** (download and keep secure)
   - Install the app on your target repositories

### 2. Logo Requirements

| Property             | Requirement                                       |
| -------------------- | ------------------------------------------------- |
| **Minimum size**     | 200×200 pixels                                    |
| **Recommended size** | 500×500 pixels (for clarity on high-DPI displays) |
| **Format**           | PNG (preferred) or JPG                            |
| **Aspect ratio**     | Square (1:1)                                      |
| **Background**       | Transparent recommended for PNG                   |

**Where to store**: Upload directly in the GitHub App settings page (not in the repository).

---

### 3. Update Workflow to Use GitHub App Token

#### [MODIFY] [ai-review.yml](.github/workflows/ai-review.yml)

Add the GitHub App authentication step:

```yaml
secrets:
  APP_ID:
    description: 'GitHub App ID for Odd AI Reviewer'
    required: false
  APP_PRIVATE_KEY:
    description: 'GitHub App private key (PEM format)'
    required: false
```

Then add the token generation step **before** "Run AI Review":

```yaml
- name: Generate GitHub App Token
  id: app-token
  if: ${{ secrets.APP_ID != '' && secrets.APP_PRIVATE_KEY != '' }}
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}
    owner: ${{ github.repository_owner }}

- name: Run AI Review
  env:
    # Use App token if available, fallback to GITHUB_TOKEN
    GITHUB_TOKEN: ${{ steps.app-token.outputs.token || secrets.GITHUB_TOKEN }}
```

---

### 4. Configure Secrets in Calling Repositories

Each repository using the AI Review workflow needs these secrets:

| Secret                            | Value                                   |
| --------------------------------- | --------------------------------------- |
| `ODD_AI_REVIEWER_APP_ID`          | The App ID from step 1                  |
| `ODD_AI_REVIEWER_APP_PRIVATE_KEY` | Contents of the `.pem` private key file |

---

## Verification Plan

### Verification Constraints

> [!WARNING]
> This plan involves **external GitHub configuration** (creating a GitHub App) which cannot be fully verified via automated tests. Verification is primarily **manual**.

### Manual Verification Steps

1. **After creating the GitHub App:**
   - Verify the app appears in GitHub Settings → Developer settings → GitHub Apps
   - Confirm the name displays as "Odd AI Reviewer" (or your chosen name)
   - Confirm the logo displays correctly on the app page

2. **After installing the app on a test repository:**
   - Create a test PR with some code changes
   - Trigger the AI review workflow
   - Verify the comment appears with:
     - ✅ Custom name "Odd AI Reviewer" instead of "github-actions"
     - ✅ Custom logo instead of GitHub's Octocat

3. **Fallback behavior (if no App secrets configured):**
   - Confirm the workflow still works with `GITHUB_TOKEN` (shows as "github-actions[bot]")

### Existing Tests

The current test suite validates the GitHub reporter logic but doesn't test the authentication identity (which is expected—identity comes from the token, not the code):

```bash
npm test
```

No new tests are required for this change since:

- Token generation is handled by `actions/create-github-app-token`
- The reporter code is unchanged—only the token source changes

---

## Summary

| Question                     | Answer                                                   |
| ---------------------------- | -------------------------------------------------------- |
| **Can we change the name?**  | ✅ Yes, by creating a GitHub App named "Odd AI Reviewer" |
| **Can we change the logo?**  | ✅ Yes, by uploading it in the GitHub App settings       |
| **Logo size?**               | Minimum 200×200, recommended 500×500 (square, PNG)       |
| **Where to store the logo?** | GitHub App settings page (not in repository)             |
| **Code changes required?**   | Minor workflow updates to support App authentication     |
