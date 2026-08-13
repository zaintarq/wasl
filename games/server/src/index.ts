import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { listen } from '@colyseus/tools';
import appConfig from './app.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const port = Number(process.env.COLYSEUS_PORT || 2567);

listen(appConfig, port).then(() => {
  console.log(`🎮 Huzz Games — Colyseus 0.17 on port ${port}`);
  console.log(`   Phaser client → http://0.0.0.0:${port}/`);
});
