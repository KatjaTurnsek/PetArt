#!/bin/sh
# Portable deploy script for StackCP/shared hosting + local dry-runs

set -e  # stop on first failing command

REPO_ROOT="$(pwd)"
DOCROOT="${DOCROOT:-"$HOME/public_html"}"  # allows: DOCROOT=/tmp/foo sh ./deploy.sh

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }

log "=== Deploy start ==="
log "whoami: $(whoami 2>/dev/null || printf unknown)"
log "SRC: $REPO_ROOT"
log "DST: $DOCROOT"
date

# Never run with sudo on shared hosting
if [ -n "${SUDO_USER:-}" ]; then
  log "ERROR: Do not run deploy.sh with sudo."
  exit 1
fi

# Sanity checks
[ -d "$REPO_ROOT" ] || { log "ERROR: Repo root not found: $REPO_ROOT"; exit 1; }
[ -d "$DOCROOT" ]   || { log "ERROR: DOCROOT not found: $DOCROOT"; exit 1; }

# Quick write test
TMPTEST="$DOCROOT/.deploy_write_test.$(date +%s).$$"
echo "write-test $(date)" > "$TMPTEST" || {
  log "ERROR: Cannot write to $DOCROOT (permissions/ownership?)"
  exit 1
}
rm -f "$TMPTEST"

# Marker
MARKER="$DOCROOT/.deploy_marker_$(date +%Y%m%d_%H%M%S)"
echo "Deployed from $REPO_ROOT at $(date)" > "$MARKER" || true

# Copy
if command -v rsync >/dev/null 2>&1; then
  log "Using rsync"
  rsync -rltD --delete \
    --exclude=".git/" --exclude=".github/" --exclude=".gitignore" \
    --exclude="node_modules/" --exclude=".vscode/" --exclude=".DS_Store" \
    --exclude="tools/" --exclude="README.md" --exclude="LICENSE" \
    "$REPO_ROOT"/ "$DOCROOT"/
else
  log "rsync not found; using tar fallback (no deletions)"
  ( cd "$REPO_ROOT" && tar -cf - \
      --exclude='./.git' --exclude='./.github' --exclude='./.gitignore' \
      --exclude='./node_modules' --exclude='./.vscode' --exclude='./.DS_Store' \
      --exclude='./tools' --exclude='./README.md' --exclude='./LICENSE' . \
    ) | ( cd "$DOCROOT" && tar -xpf - )
fi

log "=== Deploy done. Marker: $(basename "$MARKER") ==="
