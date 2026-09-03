# Cloudflare setup (Pages + Worker)

> **Important:** The repo must **not** have a root `wrangler.toml`. That file overrides GitHub auto-deploy and will publish the **games client** to your main site (`wasl-a5n.pages.dev`). Keep two separate Pages projects with dashboard settings below.

## A. Pages — main website (Wasl marketing site)

**Project:** `wasl` → `https://wasl-a5n.pages.dev`

1. Cloudflare Dashboard → **Workers & Pages** → project **wasl** → **Settings** → **Build**
2. **Production branch:** `master`
3. **Build command:** *(leave empty — static HTML)*
4. **Build output directory:** `docs`
5. **Root directory:** `/`

Manual deploy (optional):

```bash
bash scripts/deploy-website-pages.sh
```

---

## B. Pages — game UI (Phaser)

**Project:** `huzz-games` → `https://huzz-games.pages.dev`

1. Cloudflare Dashboard → **Workers & Pages** → project **huzz-games** → **Settings** → **Build**
2. **Production branch:** `master`
3. **Build command:** `bash scripts/pages-games-build.sh`
4. **Build output directory:** `games/server/public`
5. **Root directory:** `/`

Manual deploy:

```bash
bash scripts/deploy-games-pages.sh
```

Do **not** connect both projects to a root `wrangler.toml`.

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
