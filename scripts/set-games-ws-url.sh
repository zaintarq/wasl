#!/usr/bin/env bash
# Patch GAMES_WS_URL in root .env and functions/.env.huzz-10264
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="${1:-}"

if [[ -z "$RAW" ]]; then
  echo "Usage: bash scripts/set-games-ws-url.sh wss://huzz-games-api.<subdomain>.workers.dev"
  exit 1
fi

# Accept https:// or wss://; normalize to wss://
HOST="${RAW#wss://}"
HOST="${HOST#https://}"
HOST="${HOST#http://}"
HOST="${HOST%/}"
WS_URL="wss://${HOST}"

if [[ ! "$HOST" =~ ^huzz-games-api\.[a-z0-9-]+\.workers\.dev$ ]]; then
  echo "Expected host like huzz-games-api.<your-subdomain>.workers.dev"
  echo "Got: $WS_URL"
  exit 1
fi

patch_file() {
  local file="$1"
  [[ -f "$file" ]] || touch "$file"
  if grep -q '^GAMES_WS_URL=' "$file" 2>/dev/null; then
    sed -i '' "s|^GAMES_WS_URL=.*|GAMES_WS_URL=${WS_URL}|" "$file"
  else
    echo "GAMES_WS_URL=${WS_URL}" >> "$file"
  fi
  if grep -q '^EXPO_PUBLIC_GAMES_WS_URL=' "$file" 2>/dev/null; then
    sed -i '' "s|^EXPO_PUBLIC_GAMES_WS_URL=.*|EXPO_PUBLIC_GAMES_WS_URL=${WS_URL}|" "$file"
  else
    echo "EXPO_PUBLIC_GAMES_WS_URL=${WS_URL}" >> "$file"
  fi
}

patch_file "$ROOT/.env"
patch_file "$ROOT/functions/.env.huzz-10264"

echo "Updated:"
echo "  GAMES_WS_URL=${WS_URL}"
echo "  EXPO_PUBLIC_GAMES_WS_URL=${WS_URL}"
echo ""
echo "Next: cd functions && firebase deploy --only functions:getGameLaunchSession"
