#!/usr/bin/env bash
set -euo pipefail

# Where your domain actually serves files (document root).
# On Midphase/StackCP this is usually public_html for the domain.
DOCROOT="$HOME/public_html"

# rsync from the repo checkout to DOCROOT, removing old files
rsync -av --delete \
  --exclude=".git" \
  --exclude="node_modules" \
  --exclude=".github" \
  --exclude=".DS_Store" \
  ./ "$DOCROOT"/
