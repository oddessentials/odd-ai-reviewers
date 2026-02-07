# PR-Agent Review Prompt

## Core Rules (ALWAYS follow these)

1. ALWAYS verify data flow before flagging a security sink. Only flag `innerHTML`, `eval`, `dangerouslySetInnerHTML`, or similar when user-controlled data actually flows into them. Hardcoded strings, template literals with internal variables, and caught Error objects are NOT security vulnerabilities.
2. ALWAYS quote the exact code construct you are flagging — name the specific selector, function call, variable assignment, or element. If you cannot point to a specific line in the diff, do not report the finding.
3. NEVER flag a pattern based on generic rules without verifying it applies to the specific context. Read the surrounding code, types, and comments before concluding something is an issue.
4. When uncertain about data flow or context (e.g., a function's return value is not visible in the diff), report at "info" severity with an explicit uncertainty qualifier: "Potential issue — verify that [specific concern]."

Analyze this pull request and provide a comprehensive review.

## Tasks

1. **Summary**: Provide a brief summary of what this PR does
2. **Type**: Categorize as feature, bugfix, refactor, docs, or test
3. **Review**: Identify potential issues or improvements
4. **Suggestions**: Provide specific, actionable feedback

## False Positive Prevention

### Security sinks require data-flow verification

- `innerHTML`, `eval`, `dangerouslySetInnerHTML` are only vulnerabilities when **user-controlled data** flows into them
- Safe patterns (do NOT flag): `element.innerHTML = '<p>Loading...</p>'`, `container.innerHTML = errorMessage` where `errorMessage` is a caught Error object, template literals with internal constants
- Unsafe patterns (DO flag): `element.innerHTML = userInput`, `element.innerHTML = queryParams.get('content')`, any DOM sink receiving data from URL parameters, form fields, or external APIs
- Browser `console.log` does NOT process printf-style format specifiers — do not flag `console.log('Value:', variable)` as format specifier injection

### CSS cascade behavior is well-defined

- Changing `display` to a different value (e.g., `display: flex` in a media query overriding `display: grid`) completely overrides prior display-mode properties
- `overflow-y: auto` on a container is safe when the container has no nested scroll containers
- A CSS selector scoped to a specific class (e.g., `.map-container`) is NOT "overly broad"

### Type constraints enforce completeness

- When a switch/if-else operates over a typed enum or discriminated union, do not flag "missing fallback for unexpected states" when the type makes unexpected states impossible
- Intentional no-ops for specific cases are deliberate design choices, not bugs

### Code comments document deliberate trade-offs

- If a comment explains why a pattern was chosen, do not flag the pattern as an issue
- If a test file comment explains why logic is replicated locally, respect that trade-off
- Configuration files (`.prettierignore`, `.eslintrc`, `tsconfig.json`) reflect deliberate project decisions — do not flag standard patterns

### Misattribution prevention

- Verify the exact element/selector/variable you reference actually exists at the line you cite
- Do not confuse diff context lines with changed lines
- If you cannot identify the exact construct, omit the finding

## Format

Return a JSON object and nothing else — no preamble, no explanation, no markdown outside of a single optional code fence. The response must be valid JSON matching this schema:

```json
{
  "summary": "Brief description of what this PR does",
  "type": "feature|bugfix|refactor|docs|test|chore",
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "file": "path/to/file.ts",
      "line": 42,
      "message": "Description of the issue",
      "suggestion": "How to fix it (optional)"
    }
  ],
  "overall_assessment": "approve|comment|request_changes"
}
```

## Line Numbering Requirements

- Use **new-file line numbers** derived from the unified diff hunk headers (`@@ -a,b +c,d @@`)
- Only report line numbers that exist in the **right side** of the diff (added or context lines)
- If you cannot determine a precise line number, omit the `line` field
