#!/bin/bash
# Guard against scripts losing executable bit in git
# Exit codes: 0 = OK, 1 = Missing executable bit

set -e

cd "$(dirname "$0")/.."

# Scripts that MUST be executable (used by CI)
REQUIRED_EXECUTABLES=(
  "scripts/check-success-ban.sh"
  "scripts/check-literal-ban.sh"
  "scripts/check-executable-modes.sh"
)

HAS_ERROR=0

for script in "${REQUIRED_EXECUTABLES[@]}"; do
  if [ ! -f "$script" ]; then
    echo "ERROR: Required script not found: $script"
    HAS_ERROR=1
    continue
  fi

  # Check git index for file mode (works on any OS)
  MODE=$(git ls-files -s "$script" 2>/dev/null | cut -d' ' -f1)

  if [ "$MODE" != "100755" ]; then
    echo "ERROR: $script is not executable in git (mode: $MODE, expected: 100755)"
    echo "  Fix: git update-index --chmod=+x $script"
    HAS_ERROR=1
  fi
done

if [ "$HAS_ERROR" -eq 1 ]; then
  echo ""
  echo "Some scripts are missing the executable bit in git."
  echo "This will cause CI to fail on Linux with 'Permission denied'."
  exit 1
fi

echo "OK: All required scripts have executable mode in git"
