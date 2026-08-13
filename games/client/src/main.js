import Phaser from 'phaser';
import {
  parseLaunchParams,
  joinColyseusRoom,
  bindRoomHud,
  hideOverlay,
  showOverlayError,
  isMultiplayerGame,
} from './colyseus/joinRoom.js';
import { createGameConfig } from './games/createGame.js';

async function boot() {
  const launch = parseLaunchParams();
  const overlayMsg = document.getElementById('overlay-msg');
  if (overlayMsg) overlayMsg.textContent = 'Connecting to Huzz Games…';

  let room = null;
  try {
    if (isMultiplayerGame(launch.gameId) && !launch.solo) {
      room = await joinColyseusRoom(launch);
      bindRoomHud(room, launch);
    }
    hideOverlay();
    document.getElementById('hud')?.classList.add('hidden');
    // eslint-disable-next-line no-new
    new Phaser.Game(createGameConfig(launch, room));
  } catch (err) {
    console.error('[Huzz Games]', err);
    showOverlayError(err?.message || 'Failed to connect to game server.');
  }
}

boot();
