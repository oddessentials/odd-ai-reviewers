#!/bin/bash
# 011-agent-result-unions: Check for status object literals outside types.ts (FR-026)
# Constructors (AgentSuccess, AgentFailure, AgentSkipped) are the only factory path
#
# Exceptions:
# - types.ts (where constructors are defined)
# - __tests__/** (test files need literals for Zod schema validation tests)
#
# Usage: ./scripts/check-literal-ban.sh
# Exit codes: 0 = OK, 1 = Unauthorized literal found

set -e

cd "$(dirname "$0")/.."

HAS_ERROR=0

for STATUS in success failure skipped; do
  # Match status: 'value' or status: "value" patterns in production code only
  # Exclude union type definitions (contain |) which are type annotations, not literals
  MATCHES=$(grep -rn "status:[[:space:]]*['\"]$STATUS['\"]" router/src --include='*.ts' \
    | grep -v 'router/src/agents/types.ts' \
    | grep -v '__tests__' \
    | grep -v "'$STATUS'[[:space:]]*|" \
    | grep -v "|[[:space:]]*'$STATUS'" \
    || true)

  if [ -n "$MATCHES" ]; then
    echo "ERROR: status: '$STATUS' literal found in production code:"
    echo "$MATCHES"
    echo ""
    HAS_ERROR=1
  fi
done

if [ "$HAS_ERROR" -eq 1 ]; then
  echo "Fix: Use constructor helpers instead of object literals:"
  echo "  - AgentSuccess({ agentId, findings, metrics })"
  echo "  - AgentFailure({ agentId, error, failureStage, metrics })"
  echo "  - AgentSkipped({ agentId, reason, metrics })"
  echo "See: specs/011-agent-result-unions/quickstart.md"
  exit 1
fi

echo "OK: No unauthorized status literals found in production code"
echo "(Note: Test files are allowed to use literals for schema validation)"
