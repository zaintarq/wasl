#!/usr/bin/env bash
# Build a release AAB for Google Play Console upload.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d android ]]; then
  echo "Running expo prebuild for Android…"
  npx expo prebuild --platform android --no-install
fi

echo "Building release AAB (this can take several minutes)…"
cd android
./gradlew bundleRelease --no-daemon

AAB_SRC="app/build/outputs/bundle/release/app-release.aab"
AAB_OUT="$ROOT/dist/huzz-release.aab"
mkdir -p "$ROOT/dist"
cp "$AAB_SRC" "$AAB_OUT"

echo ""
echo "Done. Upload this file to Google Play Console:"
echo "  $AAB_OUT"
echo ""
echo "Package: com.huzz.app"
