#!/usr/bin/env bash
# Builds the static site for chat.isacloud.cc into isacloud/out/
# (and isacloud/isacloud-web.tar.gz), ready to copy to the web server's root.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=isacloud/out

npm run build
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R dist "$OUT/dist"
# Not needed by the chat page
rm -rf "$OUT/dist/website.css" "$OUT/dist/website.min.css" "$OUT/dist/images/logo"
cp isacloud/index.html isacloud/init.js isacloud/manifest.json "$OUT/"
tar -czf isacloud/isacloud-web.tar.gz -C "$OUT" .
echo "Done: $OUT ($(du -sh "$OUT" | cut -f1)) and isacloud/isacloud-web.tar.gz"
