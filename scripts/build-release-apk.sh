#!/usr/bin/env bash
# Build a release APK locally (no EAS). Host dist/huzz-release.apk on your site — it does not expire.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d android ]]; then
  echo "Running expo prebuild for Android…"
  npx expo prebuild --platform android --no-install
fi

echo "Building release APK (this can take several minutes)…"
cd android
./gradlew assembleRelease --no-daemon

APK_SRC="app/build/outputs/apk/release/app-release.apk"
APK_OUT="$ROOT/dist/huzz-release.apk"
mkdir -p "$ROOT/dist"
cp "$APK_SRC" "$APK_OUT"

echo ""
echo "Done. Upload this file to your website:"
echo "  $APK_OUT"
echo ""
echo "Install on Android: enable Install unknown apps, then open the APK."
echo "This APK does not expire. EAS only limits how long Expo hosts a download link."
