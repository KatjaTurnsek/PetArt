#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(pwd)"
DOCROOT="$HOME/public_html"

echo "=== Deploy start ==="
echo "SRC : $REPO_ROOT"
echo "DST : $DOCROOT"
date

# sanity
if [ ! -d "$DOCROOT" ]; then
  echo "ERROR: DOCROOT missing: $DOCROOT"
  exit 1
fi

# optional marker to verify deploys landed
MARKER="$DOCROOT/.deploy_marker_$(date +%Y%m%d_%H%M%S)"
echo "Deployed from $REPO_ROOT at $(date)" > "$MARKER"

# copy only what the live site needs
# (keep .htaccess, HTML, assets, dist, etc.; skip node_modules, tooling, dot-repo dirs)
rsync -av --delete \
  --exclude=".git/" \
  --exclude=".github/" \
  --exclude=".gitignore" \
  --exclude="node_modules/" \
  --exclude="tools/" \
  --exclude=".vscode/" \
  --exclude=".DS_Store" \
  --exclude="package*.json" \
  --exclude="postcss.config.*" \
  --exclude="README.md" \
  --exclude="LICENSE" \
  "$REPO_ROOT"/ "$DOCROOT"/

echo "=== Deploy done. Marker: $(basename "$MARKER") ==="
