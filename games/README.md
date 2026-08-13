# Huzz Games — Colyseus 0.17 + Phaser

Built on official Colyseus open-source patterns:

| Source | What we use |
|--------|-------------|
| [turnbased-cards-demo](https://github.com/colyseus/turnbased-cards-demo) | Turn order, `StateView` hidden hands, `play_card` messages, turn deadlines |
| [tutorial-phaser](https://github.com/colyseus/tutorial-phaser) | Phaser ↔ Colyseus via `Callbacks.onAdd` / `listen` |
| [colyseus/vite](https://github.com/colyseus/vite) | `defineServer` + `defineRoom` server layout |

**Stack:** Colyseus **0.17** · `@colyseus/schema` **v4** · `@colyseus/sdk` client · Phaser 3

```
HUZZ APP (WebView)
       │
       ▼
  Social → Games Hub
       │
  ┌────┼────┐
  ▼    ▼    ▼
Chess Ludo Cards   ← Phaser (games/client)
       │
       ▼
 Colyseus 0.17     ← games/server (TypeScript)
       │
   Player A ↔ Player B
```

## Server layout (matches official demos)

```
games/server/src/
  index.ts              ← @colyseus/tools listen()
  app.config.ts         ← defineServer + filterBy inviteRoomId
  schema/gameState.ts   ← schema() DSL (v4)
  rooms/
    ChessRoom.ts
    LudoRoom.ts
    CardsRoom.ts        ← StateView for private hands
  logic/chess.ts
  logic/cards.ts
```

## Games

| Game | Room | Features |
|------|------|----------|
| **Chess** | `chess` | Legal moves, king capture, 90s turn timeout |
| **Ludo** | `ludo` | Server dice, need 6 to start, auto-roll on timeout |
| **Hearts/Cards** | `cards` | 5-card tricks, **StateView** (only you see your hand), 15s timeout |

## Quick start

1. Root `.env`:

```bash
GAME_SESSION_SECRET=your-long-random-secret
GAMES_CLIENT_URL=http://YOUR_LAN_IP:2567
COLYSEUS_WS_URL=ws://YOUR_LAN_IP:2567
EXPO_PUBLIC_GAMES_CLIENT_URL=http://YOUR_LAN_IP:2567
EXPO_PUBLIC_COLYSEUS_WS_URL=ws://YOUR_LAN_IP:2567
COLYSEUS_PORT=2567
```

2. Build + run:

```bash
npm run games:build
npm run games:server
```

3. Smoke test (2-player chess sync):

```bash
GAME_SESSION_SECRET=... npm run games:smoke
```

4. Deploy Firebase `getGameLaunchSession` with same env vars.

5. **Social → play with match → pick game**

## Auth flow

Firebase callable signs token → WebView opens Phaser with `?game=…&roomId=…&token=…` → `@colyseus/sdk` `joinOrCreate(room, { inviteRoomId, token })` → server `onAuth` verifies HMAC.

## Production

Host `games/server` on Railway / Fly.io / VPS with **HTTPS + wss://**. Set Firebase `GAMES_CLIENT_URL` and `COLYSEUS_WS_URL` to that host.
