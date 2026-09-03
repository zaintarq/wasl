#!/usr/bin/env bash
# Deploy the Wasl marketing site (docs/) to Cloudflare Pages.
# Do NOT add a root wrangler.toml — it breaks GitHub auto-deploy for wasl-a5n.pages.dev.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PROJECT="${WASL_PAGES_PROJECT:-wasl-a5n}"

cd "$ROOT/games/worker"
if ! npx wrangler whoami 2>&1 | grep -q "You are logged in"; then
  echo "Not logged into Cloudflare. Run: bash scripts/deploy-games-worker.sh"
  exit 1
fi

test -f "$ROOT/docs/index.html"

npx wrangler pages deploy "$ROOT/docs" \
  --project-name="$PROJECT" \
  --branch=master \
  --commit-message="Deploy Wasl website (docs/)"

echo ""
echo "Website live at: https://${PROJECT}.pages.dev"
