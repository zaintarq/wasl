# Huzz Games — Cloudflare Pages + Workers (free tier)

**Pages** hosts the Phaser client (`https://huzz-games.pages.dev`).  
**Workers + Durable Objects** host live multiplayer rooms (WebSockets).

```
App WebView → Pages (Phaser UI)
                 ↓ WebSocket
         huzz-games-api (Worker)
                 ↓
         GameRoom (Durable Object per match)
```

## 1. Build the client

```bash
npm run games:build
```

Upload `games/server/public/` to **Cloudflare Pages** (or connect GitHub → build command `npm run games:build`, output `games/server/public`).

## 2. Deploy the multiplayer Worker

```bash
cd games/worker
npm install
npx wrangler login
npx wrangler secret put GAME_SESSION_SECRET   # same value as Firebase / root .env
npm run deploy
```

Note the Worker URL (e.g. `https://huzz-games-api.<your-subdomain>.workers.dev`).

## 3. Configure Firebase + app

Root `.env` and `functions/.env.huzz-10264`:

```bash
GAMES_CLIENT_URL=https://huzz-games.pages.dev
GAMES_WS_URL=wss://huzz-games-api.<your-subdomain>.workers.dev
EXPO_PUBLIC_GAMES_CLIENT_URL=https://huzz-games.pages.dev
EXPO_PUBLIC_GAMES_WS_URL=wss://huzz-games-api.<your-subdomain>.workers.dev
GAME_SESSION_SECRET=your-long-random-secret
```

Redeploy Cloud Functions:

```bash
cd functions && firebase deploy --only functions:getGameLaunchSession
```

## 4. Test

1. User A opens **Social → Ludo** with a match  
2. User B opens the same game invite (same `roomId` from match)  
3. Both connect to the same Durable Object — dice rolls sync in real time  

Health check: `GET https://huzz-games-api.<subdomain>.workers.dev/health`

## Local dev

Terminal 1 — Worker:

```bash
npm run games:worker:dev
# default ws://localhost:8787
```

Terminal 2 — Phaser client:

```bash
npm run games:dev
# open with ?game=ludo&roomId=test&token=...&wsUrl=ws://localhost:8787
```

## Games

| Game | Live multiplayer |
|------|------------------|
| Ludo | ✅ Worker + DO |
| Chess | 🔜 same pattern |
| Hearts/Cards | 🔜 |
| Solitaire, Puzzle, Snake | Solo (no Worker) |

## Optional: legacy Colyseus server

`games/server` (Node/Colyseus) is kept for local dev only. Production uses Cloudflare Workers.
