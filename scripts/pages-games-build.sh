#!/usr/bin/env bash
# Cloudflare Pages build for huzz-games (Phaser client).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HID=0

# On Cloudflare CI, hide Firebase functions/ so Pages doesn't compile it as Pages Functions.
if [[ -n "${CI:-}" ]] && [[ -d "$ROOT/functions" ]]; then
  mv "$ROOT/functions" "$ROOT/.firebase-functions-hidden"
  HID=1
  echo "Hidden functions/ for Pages deploy (CI)"
fi

cleanup() {
  if [[ "$HID" == 1 ]] && [[ -d "$ROOT/.firebase-functions-hidden" ]]; then
    mv "$ROOT/.firebase-functions-hidden" "$ROOT/functions"
  fi
}
# Local runs restore on exit; CI leaves hidden for Pages' post-build scan.
if [[ "$HID" == 0 ]]; then
  trap cleanup EXIT
fi

cd "$ROOT/games/client"
npm ci
npm run build

test -f "$ROOT/games/server/public/index.html"
echo "OK: games/server/public ready"
