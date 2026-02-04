Here’s a **consolidated, no-nonsense list of items that must be resolved before this PR can merge**. Each item is distilled to what matters _right now_—no deferrals, no refactors-for-later.

- **Fix semantic-release changelog misconfiguration.**
  `.releaserc.json` is incorrectly writing to `router/CHANGELOG.md`, which conflicts with the existing root `CHANGELOG.md` and will produce split or missing release notes. Update all changelog and git asset paths to use the repository-root `CHANGELOG.md`, including the verification path in `release.yml`.

- **Delete the deprecated `npm-publish.yml` workflow.**
  The workflow is explicitly marked deprecated, has no valid primary trigger, and can still consume CI minutes via manual dispatch. Leaving it in the repo creates ambiguity about the active release mechanism and must be removed entirely.

- **Remove shell injection risk in `release.yml`.**
  The current `sed` usage when parsing git tags can break or behave unpredictably if tags contain special characters. Replace it with safe shell parameter expansion to ensure deterministic and secure version extraction.

- **Fix OpenAI API incompatibility for newer models.**
  The OpenCode agent uses `max_tokens`, which is rejected by gpt-5.x models and causes hard failures. Update the SDK call to use `max_completion_tokens` or add model-aware parameter switching so local review does not break.

- **Address Windows-blocking Semgrep failure.**
  Semgrep crashes on Windows due to Python cp1252 encoding issues, completely blocking required static analysis and preventing local review from completing. Set `PYTHONUTF8=1` when spawning Semgrep and add graceful degradation or documentation if the fix is insufficient.

- **Eliminate unsafe error casting in the dependency checker.**
  The code assumes all caught errors are `NodeJS.ErrnoException` without runtime validation, which can lead to undefined behavior. Add a proper type guard before accessing error properties or normalize non-Error throws.

- **Harden error handling in `loadConfigWithFallback`.**
  The function mixes specific error handling with unsafe generic casting, allowing non-Error throws to flow through unchecked. Either rethrow non-Error values immediately or wrap them in a standard `Error` to preserve invariants.

- **Resolve third-party GitHub Action supply-chain risk.**
  `exuanbo/actions-deploy-gist@v1` is unpinned and receives secrets, exposing you to upstream compromise. Pin the action to a commit SHA and strongly consider replacing it with `github-script` and the official GitHub API.

- **Unskip and implement required integration tests.**
  Two skipped local-review integration tests represent critical execution paths and currently block meaningful coverage guarantees. Either implement real repo-backed tests or explicitly document and enforce why they cannot exist.

- **Fix semantic-release breaking-change detection.**
  The release rules only honor `"breaking": true` and ignore standard `BREAKING CHANGE:` footers, leading to silent major-version misses. Add footer-based detection so conventional commits behave correctly.

These items are **blocking by design**: they affect release correctness, security posture, cross-platform usability, or basic operability of local review. Everything else can be scheduled, but these cannot.
