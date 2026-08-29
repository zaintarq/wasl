#!/usr/bin/env bash
# Build + upload games client to Cloudflare Pages (bypasses GitHub CI).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

bash "$ROOT/scripts/pages-games-build.sh"

cd "$ROOT/games/worker"
if ! npx wrangler whoami 2>&1 | grep -q "You are logged in"; then
  echo "Not logged into Cloudflare. Run: bash scripts/deploy-games-worker.sh"
  exit 1
fi

npx wrangler pages deploy "$ROOT/games/server/public" \
  --project-name=huzz-games \
  --branch=master \
  --commit-message="Deploy games client with Worker WebSocket client"

echo ""
echo "Live at: https://huzz-games.pages.dev"
