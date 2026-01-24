This odd-ai-reviewer application has a critical bug that causes the reviewers to comment on the wrong line of code during a review. After deep investigation, propose an enterprise-grade solution that resolves this issue effectively for both GitHub and Azure DevOps supported by tests that prove accuracy and prevent regressions. We already have two suggested fixes (each in a different branch). Review the two remote branches and inspect how they attempt to fix the bug we have. Do you think one branch does a better job than the other? Are there pros and cons to both approaches? Do not modify any code at this point, but create an implementation plan to adopt the best solution based on both examples or suggest we adopt a branch verbatim in order to fix this issue professionally with enterprise-grade best practices.

branch: claude/fix-reviewer-line-bug-SSgPl
summary
This PR adds comprehensive diff line validation to prevent posting inline comments on lines that don't exist in the pull request diff. When findings reference lines outside the diff context, they are now skipped with detailed reporting of why they were invalid and suggestions for the nearest valid line.

Key Changes
New diff_line_validator module (router/src/diff_line_validator.ts):

parseDiffHunks(): Parses unified diff format to extract valid line ranges per hunk
buildDiffLineMap(): Creates a map of all valid lines (added and context) for each file in the diff
validateFindingLine(): Validates individual finding line numbers against the diff with optional auto-fix suggestions
filterValidFindings(): Batch validates findings and separates valid from invalid with statistics
findNearestValidLine(): Suggests the closest valid line when a finding references an invalid line
getFileDiffSummary(): Generates human-readable summaries of diff coverage per file
Comprehensive test coverage (router/src/**tests**/diff_line_validator.test.ts):

604 lines of tests covering all parsing scenarios (additions, deletions, context lines, multiple hunks, edge cases)
Real-world diff scenarios including multi-hunk TypeScript files, renamed files, and large gaps between hunks
Tests for all validation functions with various input combinations
Reporter integration tests (router/src/**tests**/reporter_line_validation.test.ts):

654 lines of tests verifying GitHub and ADO reporters validate lines before posting
Tests for valid/invalid line handling, mixed batches, and backward compatibility
Edge case coverage (findings without line numbers, empty diffs, deleted files)
Implementation Details
Diff parsing: Handles unified diff format including edge cases like "No newline at end of file" markers and single-line hunks without explicit counts
Line tracking: Distinguishes between added lines and context lines, enabling optional additionsOnly filtering
Graceful degradation: When diff files aren't provided, validation is skipped for backward compatibility
Detailed reporting: Invalid findings include the reason for rejection and nearest valid line suggestion for user guidance
Performance: Uses Set-based lookups for O(1) line validation after initial parsing
Testing
1,258 lines of test code across two test files
Covers parsing, validation, filtering, and reporter integration
Tests both happy paths and edge cases

---

branch: codex/investigate-bug-in-odd-ai-reviewer
Motivation
Prevent misaligned inline comments by mapping reported line numbers (from tools and LLMs) against unified diffs so comments use accurate new-file line numbers for both GitHub and Azure DevOps.
Standardize LLM prompt guidance so agents emit line numbers consistent with diff-derived new-file numbering.
Description
Add a diff-aware line resolver in router/src/report/line-mapping.ts that builds per-file mappings from unified diffs and exposes buildLineResolver and normalizeFindingsForDiff to translate or drop invalid line references.
Normalize findings before reporting by calling buildLineResolver(...) and normalizeFindingsForDiff(...) in both reporters, and switch the reporters to accept a diffFiles: DiffFile[] parameter; updated function signatures: reportToGitHub(..., diffFiles) and reportToADO(..., diffFiles).
Propagate diff context from the router by passing diff.files into reportToGitHub and reportToADO from router/src/main.ts so reporters can resolve lines.
Update prompts and ai_semantic_review agent system prompt to require new-file (right-side) diff line numbers when present and instruct omission when uncertain (config/prompts/\* and router/src/agents/ai_semantic_review.ts).
Add tests covering resolver behavior and integration with reporters: router/src/**tests**/line_mapping.test.ts, router/src/**tests**/github_line_mapping.test.ts, and an added ADO inline mapping test in router/src/**tests**/ado.test.ts and update call sites in existing tests to pass diffFiles where required.
Minor lint/format adjustments to satisfy project checks (Prettier/ESLint) and ensure tests run cleanly.
Testing
Ran linter with npm run lint and fixed issues; result: passed.
Ran full unit test suite with npm run test and validated all tests passed (including new mapping tests); result: passed.
Ran focused mapping tests with npm run test --workspace=router -- --run src/**tests**/line_mapping.test.ts to validate resolver edge cases; result: passed.
