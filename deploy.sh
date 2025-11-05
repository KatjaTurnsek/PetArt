#!/usr/bin/env bash
set -euo pipefail

# ── SETTINGS ──────────────────────────────────────────────────────────────────
# Your real document root on this server. $HOME usually resolves to:
# /home/sites/17b/a/a62d00fdda
DOCROOT="$HOME/public_html"

# If you changed your structure, update these paths accordingly.
DIST_FILE="dist/styles.min.css"

# ── PRE-FLIGHT ────────────────────────────────────────────────────────────────
echo "Deploying to: $DOCROOT"

# Ensure target exists
mkdir -p "$DOCROOT"

# Warn if the built CSS bundle is missing (you usually build locally)
if [[ ! -f "$DIST_FILE" ]]; then
  echo "WARNING: $DIST_FILE not found."
  echo "         Run: npm run build:css   (locally)   before deploying."
fi

# Optional: write a tiny deploy marker (commit + time)
DEPLOY_INFO="$DOCROOT/.deploy-info"
{
  echo "Deployed: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
  echo "Commit:   $(git rev-parse --short HEAD || echo 'unknown')"
} > "$DEPLOY_INFO" 2>/dev/null || true

# ── RSYNC (publish) ───────────────────────────────────────────────────────────
# -a : archive (permissions, times)
# -v : verbose
# --delete : remove files in DOCROOT that no longer exist in repo
# --filter 'P .git/' : PROTECT the .git folder already in public_html (don’t delete it)
# Exclude common dev stuff from being published
rsync -av --delete \
  --filter='P .git/' \
  --exclude=".git" \
  --exclude=".github" \
  --exclude=".DS_Store" \
  --exclude="node_modules" \
  --exclude="tools" \
  --exclude="README.md" \
  --exclude="postcss.config.cjs" \
  --exclude="package-lock.json" \
  --exclude="*.map" \
  ./ "$DOCROOT"/

echo "✅ Deploy complete → $DOCROOT"
