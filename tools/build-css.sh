#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="src/css"
DIST_DIR="dist"
TMP="$DIST_DIR/styles.concat.css"

mkdir -p "$DIST_DIR"

# 1) Concatenate in the exact order you need
#    (reset → variables → global → page layers)
cat \
  "$SRC_DIR/reset.css" \
  "$SRC_DIR/variables.css" \
  "$SRC_DIR/global.css" \
  "$SRC_DIR/home.css" \
  "$SRC_DIR/about.css" \
  "$SRC_DIR/contact.css" \
  "$SRC_DIR/gallery.css" \
  "$SRC_DIR/prices.css" \
  > "$TMP"

# 2) Minify to a single file for production
npx clean-css-cli -O2 --source-map --source-map-inline-sources \
  -o "$DIST_DIR/styles.min.css" "$TMP"

# 3) Optional: versioned copy (cache-busting by date)
STAMP=$(date +%Y%m%d)
cp "$DIST_DIR/styles.min.css" "$DIST_DIR/styles.$STAMP.min.css"

echo "Built:"
echo " - $DIST_DIR/styles.min.css"
echo " - $DIST_DIR/styles.$STAMP.min.css"
