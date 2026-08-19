/**
 * Injects cross-service imports into split firebase modules.
 */
import fs from 'fs';
import path from 'path';

const DIR = path.resolve(import.meta.dirname, '../src/services/firebase');

const deps = {
  authService: ['userService'],
  userService: ['authService'],
  matchService: ['notificationService', 'authService', 'likeService'],
  likeService: ['matchService', 'notificationService'],
  messageService: ['notificationService', 'reportService', 'safetyService', 'userService'],
  liveRandomService: ['messageService', 'reportService', 'safetyService', 'authService'],
  clubService: ['reportService', 'safetyService', 'messageService', 'authService'],
  verificationService: ['userService', 'notificationService'],
  photoUploadService: ['userService'],
  contactUploadService: ['userService'],
  blockService: ['userService'],
  reportService: ['safetyService'],
};

for (const [file, services] of Object.entries(deps)) {
  const fp = path.join(DIR, `${file}.js`);
  if (!fs.existsSync(fp)) continue;
  let content = fs.readFileSync(fp, 'utf8');
  const marker = "} from './callables';\n";
  if (!content.includes(marker)) continue;
  const importLines = services
    .map((s) => `import { ${s} } from './${s}.js';`)
    .join('\n');
  if (content.includes(importLines.split('\n')[0])) continue;
  content = content.replace(marker, `${marker}\n${importLines}\n`);
  fs.writeFileSync(fp, content);
  console.log('Patched', file);
}

// Fix messageService toxicity fallback
const msgPath = path.join(DIR, 'messageService.js');
let msg = fs.readFileSync(msgPath, 'utf8');
msg = msg.replace(
  /if \(!callable\) \{\s*return scanMessageText\(trimmed\)\.flagged;\s*\}/,
  'if (!callable) {\n      return isMessageToxicLocal(trimmed);\n    }'
);
msg = msg.replace(
  /\} catch \{\s*return scanMessageText\(trimmed\)\.flagged;\s*\}/,
  '} catch {\n      return isMessageToxicLocal(trimmed);\n    }'
);
fs.writeFileSync(msgPath, msg);
console.log('Fixed messageService toxicity');
