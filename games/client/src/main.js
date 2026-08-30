import Phaser from 'phaser';
import { parseLaunchParams, isMultiplayerGame, bindRoomHud } from './colyseus/joinRoom.js';
import { joinOnlineRoom } from './realtime/joinOnlineRoom.js';
import { createGameConfig } from './games/createGame.js';

async function boot() {
  const launch = parseLaunchParams();
  const overlayMsg = document.getElementById('overlay-msg');
  if (overlayMsg) {
    overlayMsg.textContent = launch.solo ? 'Loading game…' : 'Connecting to Huzz Games…';
  }

  const expectsOpponent = !!(launch.opponentName || launch.opponentUid);
  let room = null;
  try {
    if (isMultiplayerGame(launch.gameId) && !launch.solo) {
      room = await joinOnlineRoom(launch);
      bindRoomHud(room, launch);
    }
    hideOverlay();
    document.getElementById('hud')?.classList.add('hidden');
    // eslint-disable-next-line no-new
    new Phaser.Game(createGameConfig(launch, room));
  } catch (err) {
    console.error('[Huzz Games]', err);
    if (isMultiplayerGame(launch.gameId) && !expectsOpponent) {
      try {
        launch.solo = true;
        hideOverlay();
        document.getElementById('hud')?.classList.add('hidden');
        new Phaser.Game(createGameConfig(launch, null));
        return;
      } catch (fallbackErr) {
        console.error('[Huzz Games] local fallback failed', fallbackErr);
      }
    }
    showOverlayError(
      err?.message ||
        (expectsOpponent
          ? 'Could not connect to the live game server. Ask your match to try again, or check your connection.'
          : 'Failed to connect to game server.')
    );
  }
}

function hideOverlay() {
  const el = document.getElementById('overlay');
  if (el) el.classList.add('hidden');
}

function showOverlayError(message) {
  const el = document.getElementById('overlay');
  const msg = document.getElementById('overlay-msg');
  if (msg) msg.textContent = message;
  if (el) {
    el.classList.remove('hidden');
    const title = el.querySelector('h1');
    if (title) title.textContent = 'Could not join';
    const spinner = el.querySelector('.spinner');
    if (spinner) spinner.style.display = 'none';
  }
}

boot();
