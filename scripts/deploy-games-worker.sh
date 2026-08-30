#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/games/worker"

wrangler_login_edge() {
  local log url pid
  log="$(mktemp)"
  echo "Log in to Cloudflare — opening Microsoft Edge (not Chrome)…"

  # Wrangler ignores BROWSER=; --browser false stops it opening the default browser.
  npx wrangler login --browser false 2>&1 | tee "$log" &
  pid=$!

  url=""
  for _ in $(seq 1 60); do
    url="$(grep -Eo 'https://dash\.cloudflare\.com/oauth2/auth[^[:space:]]+' "$log" 2>/dev/null | head -1 || true)"
    if [[ -n "$url" ]]; then
      bash "$ROOT/scripts/open-edge.sh" "$url"
      echo "Finish login in Edge, then come back to this terminal."
      break
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done

  if [[ -z "$url" ]]; then
    echo "Could not auto-open Edge. Copy the OAuth URL from above into Edge manually."
  fi

  wait "$pid"
  local status=$?
  rm -f "$log"
  return "$status"
}

if ! npx wrangler whoami 2>&1 | grep -q "You are logged in"; then
  wrangler_login_edge
fi

SECRET="$(grep '^GAME_SESSION_SECRET=' "$ROOT/.env" | cut -d= -f2- | tr -d '\r' || true)"
if [[ -z "$SECRET" ]]; then
  echo "Missing GAME_SESSION_SECRET in $ROOT/.env"
  exit 1
fi

printf '%s' "$SECRET" | npx wrangler secret put GAME_SESSION_SECRET

DEPLOY_LOG="$(mktemp)"
npx wrangler deploy 2>&1 | tee "$DEPLOY_LOG"

WORKER_HTTPS="$(grep -Eo 'https://huzz-games-api\.[a-z0-9-]+\.workers\.dev' "$DEPLOY_LOG" | tail -1 || true)"
if [[ -z "$WORKER_HTTPS" ]]; then
  WORKER_HTTPS="$(grep -Eo 'https://[a-z0-9-]+\.workers\.dev' "$DEPLOY_LOG" | grep huzz-games-api | tail -1 || true)"
fi

rm -f "$DEPLOY_LOG"

if [[ -n "$WORKER_HTTPS" ]]; then
  bash "$ROOT/scripts/set-games-ws-url.sh" "$WORKER_HTTPS"
  echo ""
  echo "Deploying Firebase getGameLaunchSession with new ws URL…"
  (cd "$ROOT/functions" && firebase deploy --only functions:getGameLaunchSession)
else
  echo ""
  echo "Could not detect Worker URL from wrangler output."
  echo "Copy the URL from above, then run:"
  echo "  bash scripts/set-games-ws-url.sh wss://huzz-games-api.<subdomain>.workers.dev"
fi
