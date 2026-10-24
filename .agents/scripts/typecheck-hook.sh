#!/usr/bin/env bash
# Antigravity 2.0 PostToolUse Hook: Runs tsc --noEmit whenever files are written/edited
# Working directory when invoked by Antigravity is the directory containing hooks.json (.agents/)

set -uo pipefail

# Consume stdin payload required by Antigravity Hook contract
cat > /dev/null || true

export PATH="/home/duke/.gemini/antigravity/brain/d0ca03e2-ba57-4654-bdd7-1c8fd2d8b087/scratch/node-v22.14.0-linux-x64/bin:$PATH"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [ -f "tsconfig.json" ] && [ -x "node_modules/.bin/tsc" ]; then
  if ! ./node_modules/.bin/tsc --noEmit >&2; then
    echo '{"error": "TypeScript compilation (tsc --noEmit) failed. Fix type or architectural boundary errors."}' >&2
    exit 1
  fi
fi

# PostToolUse contract expects an empty JSON object on stdout
printf '{}\n'
