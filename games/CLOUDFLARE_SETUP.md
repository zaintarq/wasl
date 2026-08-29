# Cloudflare setup (Pages + Worker)

## A. Pages — game UI (Phaser)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select repo: **zaintarq/wasl**
3. **Build settings:**
   - **Production branch:** `master`
   - **Build command:** `bash scripts/pages-games-build.sh`
   - **Build output directory:** `games/server/public`
   - **Root directory:** `/` (repo root)
4. **Environment variables** (optional for build): none required
5. Deploy → your site stays at **`https://huzz-games.pages.dev`** (or custom domain)

> If Pages is already connected, open the project → **Deployments** → **Retry deployment** after pushing to GitHub.

---

## B. Worker — live multiplayer (WebSocket)

Must run **once on your Mac** (opens **Microsoft Edge** for Cloudflare login):

```bash
bash scripts/deploy-games-worker.sh
```

> Uses Edge instead of your default browser. If Edge isn't installed, it falls back to the system default.

That script:
1. Opens Cloudflare login in your browser (`wrangler login`)
2. Uploads `GAME_SESSION_SECRET` from root `.env`
3. Deploys `huzz-games-api`

Copy the URL Wrangler prints, e.g. `https://huzz-games-api.YOURNAME.workers.dev`

Update root `.env` and `functions/.env.huzz-10264`:

```bash
GAMES_WS_URL=wss://huzz-games-api.YOURNAME.workers.dev
EXPO_PUBLIC_GAMES_WS_URL=wss://huzz-games-api.YOURNAME.workers.dev
```

Redeploy Firebase:

```bash
cd functions && firebase deploy --only functions:getGameLaunchSession
```

**Health check:** open `https://huzz-games-api.YOURNAME.workers.dev/health` → should show `{"ok":true}`

---

## C. Test 2-player Ludo

1. Two phones, two accounts matched with each other  
2. **Social → Ludo** (or play from chat) on both  
3. Both should see “Waiting for opponent (1/2)” then the game starts  
4. Rolls sync between devices  

If Worker isn’t deployed yet, the app falls back to **solo vs CPU**.
