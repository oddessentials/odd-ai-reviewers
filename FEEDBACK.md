1. Off-by-one node visit limit ✅ Correct
   At path-analyzer.ts:316-327:

if (state.nodesVisited > state.maxNodesVisited) { // Line 316
// ... return early
}
state.nodesVisited++; // Line 327

The check uses > (strictly greater than) before incrementing. This means:

When nodesVisited = 10000 and maxNodesVisited = 10000
Check: 10000 > 10000 = false → continue processing
Increment to 10001
Result: 10,001 nodes processed for a 10,000 limit
The comment claims intentionality, but the variable name maxNodesVisited semantically implies an upper bound, not a "one-past" value.

2. Mitigation mapping placeholder causes false negatives ✅ Correct
   At path-analyzer.ts:414-422:

pathMitigatesVulnerability(path: ExecutionPath, \_vulnType: VulnerabilityType): boolean {
return path.mitigations.some((\_m) => {
return true; // Placeholder - actual implementation would check pattern mappings
});
}

This returns true for any path with any mitigation, regardless of whether that mitigation actually applies to the vulnerability type being analyzed. This can suppress real vulnerabilities from being reported.

3. Spec link checker only validates 2 paths per line ✅ Correct
   At check-spec-test-links.cjs:52:

const testCoveragePattern = /\*\*Test Coverage\*\*:\s*`([^`]+)`(?:\s*,\s\*`([^`]+)`)?/g;

Only two capture groups exist. A line like:

**Test Coverage**: `test1.ts`, `test2.ts`, `test3.ts`

Would only validate test1.ts and test2.ts; test3.ts would be silently ignored.
