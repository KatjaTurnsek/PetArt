#!/usr/bin/env bash
set -euo pipefail

# Runs inside the repo checkout (StackCP executes the script there)
REPO_ROOT="$(pwd)"
DOCROOT="$HOME/public_html"

echo "=== Deploy start ==="
echo "whoami: $(whoami)"
echo "SRC: $REPO_ROOT"
echo "DST: $DOCROOT"
date

# Sanity checks
if [ ! -d "$REPO_ROOT" ]; then
  echo "ERROR: Repo root not found: $REPO_ROOT"
  exit 1
fi

if [ ! -d "$DOCROOT" ]; then
  echo "ERROR: DOCROOT not found: $DOCROOT"
  exit 1
fi

# Quick write test (verifies permissions in public_html)
TESTFILE="$DOCROOT/.deploy_write_test"
echo "write-test $(date)" > "$TESTFILE" || {
  echo "ERROR: Cannot write to $DOCROOT (permissions/ownership?)"
  exit 1
}

# Marker to see when deploy landed
MARKER="$DOCROOT/.deploy_marker_$(date +%Y%m%d_%H%M%S)"
echo "Deployed from $REPO_ROOT at $(date)" > "$MARKER"

# Sync site → public_html
# - NO sudo
# - Protect destination .git (in case StackCP keeps one there)
# - Don’t try to change perms/owners (shared hosting)
rsync -av --delete \
  --filter='protect .git/' \
  --exclude=".git/" \
  --exclude=".github/" \
  --exclude=".gitignore" \
  --exclude="node_modules/" \
  --exclude=".vscode/" \
  --exclude=".DS_Store" \
  --exclude="tools/" \
  --exclude="README.md" \
  --exclude="LICENSE" \
  --no-perms --no-owner --no-group --omit-dir-times \
  "$REPO_ROOT"/ "$DOCROOT"/

echo "=== Deploy done. Marker: $(basename "$MARKER") ==="
