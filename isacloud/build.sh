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
# The published version: the commit, plus the build time when there are uncommitted
# changes. Written into the page and into version.json, which the isacloud-update
# plugin compares to show the "new version" notice. The query on the main script
# and stylesheet makes browsers fetch the new ones after an update.
VERSION="$(git rev-parse --short HEAD)"
git diff --quiet HEAD -- src isacloud || VERSION="$VERSION-$(date +%Y%m%d%H%M%S)"
V="$VERSION" perl -pi -e 's/(<meta name="isacloud-version" content=")"/$1$ENV{V}"/; s/(converse\.min\.(js|css))"/$1?v=$ENV{V}"/g' "$OUT/index.html"
printf '{ "version": "%s" }\n' "$VERSION" > "$OUT/version.json"
COPYFILE_DISABLE=1 tar --no-xattrs -czf isacloud/isacloud-web.tar.gz -C "$OUT" .
echo "Done: $OUT ($(du -sh "$OUT" | cut -f1)) and isacloud/isacloud-web.tar.gz"
