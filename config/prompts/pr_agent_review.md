# PR-Agent Review Prompt

Analyze this pull request and provide a comprehensive review.

## Tasks

1. **Summary**: Provide a brief summary of what this PR does
2. **Type**: Categorize as feature, bugfix, refactor, docs, or test
3. **Review**: Identify potential issues or improvements
4. **Suggestions**: Provide specific, actionable feedback

## Format

Respond with structured JSON containing:
- summary: string
- type: string
- findings: array of { severity, file, line, message, suggestion }
- overall_assessment: string (approve, comment, request_changes)
