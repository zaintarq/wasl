#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/games/worker"

if ! npx wrangler whoami 2>&1 | grep -q "You are logged in"; then
  echo "Log in to Cloudflare first:"
  npx wrangler login
fi

SECRET="$(grep '^GAME_SESSION_SECRET=' "$ROOT/.env" | cut -d= -f2- | tr -d '\r' || true)"
if [[ -z "$SECRET" ]]; then
  echo "Missing GAME_SESSION_SECRET in $ROOT/.env"
  exit 1
fi

printf '%s' "$SECRET" | npx wrangler secret put GAME_SESSION_SECRET
npx wrangler deploy

echo ""
echo "Done. Copy the Worker URL above into .env:"
echo "  GAMES_WS_URL=wss://<your-worker-host>"
echo "  EXPO_PUBLIC_GAMES_WS_URL=wss://<your-worker-host>"
echo "Then: cd functions && firebase deploy --only functions:getGameLaunchSession"
