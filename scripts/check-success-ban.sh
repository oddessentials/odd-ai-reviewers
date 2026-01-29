#!/bin/bash
# 011-agent-result-unions: Check for AgentResult.success usage in router/src (FR-019, FR-020)
#
# PRIMARY ENFORCEMENT: TypeScript compiler - AgentResult no longer has a .success property.
# Any attempt to use .success on AgentResult fails at compile time.
#
# SECONDARY ENFORCEMENT (this script): Grep-based defense-in-depth for:
# - Catching patterns that might slip through during code review
# - Documentation of the enforcement policy
#
# Note: This script cannot distinguish AgentResult.success from Zod safeParse().success
# (both use `.success`) so it uses heuristics to filter known Zod patterns.
#
# Usage: ./scripts/check-success-ban.sh
# Exit codes: 0 = OK (no suspicious usage), 1 = Suspicious pattern found

set -e

cd "$(dirname "$0")/.."

# Search for .success that looks like AgentResult misuse.
# We use context-based filtering since we can't do type analysis in bash.
#
# Known legitimate .success usages (NOT AgentResult):
# - Zod safeParse().success - line typically contains 'safeParse' or 'Schema'
# - Zod parse result variables - parseResult, syntaxResult, schemaResult, validation
# - Report formatting inline types - r.success in generateAgentStatusTable
# - Test assertions on schemas

# First, check for obvious AgentResult misuse patterns:
# - "agentResult.success" variable name
# - Comments mentioning AgentResult with .success nearby
OBVIOUS_MISUSE=$(grep -rn 'agentResult\.success\|AgentResult.*\.success' router/src --include='*.ts' \
  | grep -v '__tests__' \
  || true)

if [ -n "$OBVIOUS_MISUSE" ]; then
  echo "ERROR: AgentResult.success usage found:"
  echo "$OBVIOUS_MISUSE"
  echo ""
  echo "Fix: Use isSuccess(result) type guard instead of result.success"
  echo "See: specs/011-agent-result-unions/quickstart.md"
  exit 1
fi

# Note: Additional .success usages exist for Zod safeParse() results,
# which is a different type. Those are legitimate and not checked here.
# The TypeScript compiler prevents AgentResult.success at build time.

echo "OK: No AgentResult.success misuse patterns found"
echo "(Note: Zod safeParse().success is allowed - that's a different type)"
