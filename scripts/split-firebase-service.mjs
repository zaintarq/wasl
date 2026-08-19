/**
 * One-time splitter: moves firebaseService.js into src/services/firebase/* modules.
 * Run: node scripts/split-firebase-service.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src/services/firebaseService.js');
const OUT = path.join(ROOT, 'src/services/firebase');

const raw = fs.readFileSync(SRC, 'utf8');
const lines = raw.split('\n');

const SHARED_END = 82; // through getMatchId closing brace
const CALLABLES_START = 1220; // line 1221 0-indexed 1220
const CALLABLES_END = 1273;

const exports = [
  { name: 'authService', start: 83, end: 488 },
  { name: 'userService', start: 489, end: 627 },
  { name: 'matchService', start: 628, end: 951 },
  { name: 'likeService', start: 952, end: 1215 },
  { name: 'safetyService', start: 1274, end: 1286 },
  { name: 'aiSuggestionService', start: 1287, end: 1303 },
  { name: 'moderationNoticeService', start: 1304, end: 1331 },
  { name: 'messageService', start: 1332, end: 1667 },
  { name: 'translationService', start: 1668, end: 1672 },
  { name: 'liveRandomService', start: 1673, end: 1908 },
  { name: 'blockService', start: 1909, end: 2002 },
  { name: 'reportService', start: 2003, end: 2081 },
  { name: 'notificationService', start: 2082, end: 2159 },
  { name: 'deviceBanService', start: 2160, end: 2190 },
  { name: 'appUpdateService', start: 2191, end: 2235 },
  { name: 'checkUserRoleFromAdminCollection', start: 2236, end: 2274, fn: true },
  { name: 'adminService', start: 2275, end: 2644 },
  { name: 'contactBlockService', start: 2645, end: 2675 },
  { name: 'contactUploadService', start: 2676, end: 2802 },
  { name: 'photoUploadService', start: 2803, end: 2877 },
  { name: 'storageService', start: 2878, end: 2975 },
  { name: 'verificationService', start: 2976, end: 3125 },
  { name: 'datePlanService', start: 3126, end: 3324 },
  { name: 'clubService', start: 3325, end: lines.length - 1 },
];

const sharedBlock = lines.slice(0, SHARED_END + 1).join('\n');
const callablesBlock = lines.slice(CALLABLES_START, CALLABLES_END + 1).join('\n');

fs.mkdirSync(OUT, { recursive: true });

const constantsContent = `${sharedBlock.replace(/^import[\s\S]*?from 'firebase\/storage';\n/m, '')}
`;

// constants: COL + helpers only (strip auth/firestore imports from shared - rewrite clean)
const constantsOnly = `/**
 * Firestore collection names and shared helpers.
 */
export const COL = {
  users: 'users',
  matches: 'matches',
  reports: 'reports',
  safetyEvents: 'safetyEvents',
  userSafetyProfiles: 'userSafetyProfiles',
  bannedDevices: 'bannedDevices',
  liveRandomPool: 'liveRandomPool',
  liveRandomSessions: 'liveRandomSessions',
  verifications: 'verifications',
  admin: 'admin',
  vulgarAttempts: 'vulgarAttempts',
  appAlerts: 'appAlerts',
  clubs: 'clubs',
  usernames: 'usernames',
};

import { collection, doc } from 'firebase/firestore';
import { db } from '../firebase';

export function userNotificationsCol(uid) {
  return collection(db, COL.users, String(uid), 'notifications');
}

export function bannedDeviceDoc(deviceHash) {
  return doc(db, COL.bannedDevices, String(deviceHash));
}

export function getMatchId(uidA, uidB) {
  const [a, b] = [String(uidA), String(uidB)].sort();
  return \`\${a}_\${b}\`;
}
`;

fs.writeFileSync(path.join(OUT, 'constants.js'), constantsOnly);

const callablesContent = `import { app } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

${callablesBlock.replace(/^const /gm, 'export const ')}
`;

fs.writeFileSync(path.join(OUT, 'callables.js'), callablesContent);

const serviceImports = `import { app, auth, db, storage } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  deleteField,
  query,
  orderBy,
  where,
  onSnapshot,
  limit,
  addDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { sendExpoPushAsync } from '../pushService';
import { scanMessageText, isMessageToxicLocal } from '../moderationService';
import { sha256 } from '../../utils/hash.native';
import { translateChatMessage } from '../translateChatMessage';
import { COL, getMatchId, userNotificationsCol, bannedDeviceDoc } from './constants';
import {
  _checkMessageToxicityCallable,
  _recordLikeCallable,
  _recordSafetyEventCallable,
  _generateChatSuggestionsCallable,
  _generateModerationEvidenceCallable,
  _sendModerationNoticeCallable,
} from './callables';
`;

for (const exp of exports) {
  const body = lines.slice(exp.start, exp.end + 1).join('\n');
  const fileName = exp.fn ? 'roles.js' : `${exp.name}.js`;
  if (exp.fn) {
    fs.writeFileSync(
      path.join(OUT, fileName),
      `${serviceImports}\n${body}\n`
    );
    continue;
  }
  fs.writeFileSync(path.join(OUT, fileName), `${serviceImports}\n${body}\n`);
}

// index.js re-exports + cross-service wiring for circular refs
const indexContent = `/**
 * Firebase client services — split from legacy firebaseService.js
 */
export { COL, getMatchId, userNotificationsCol, bannedDeviceDoc } from './constants';

export { authService } from './authService.js';
export { userService } from './userService.js';
export { matchService } from './matchService.js';
export { likeService } from './likeService.js';
export { safetyService } from './safetyService.js';
export { aiSuggestionService } from './aiSuggestionService.js';
export { moderationNoticeService } from './moderationNoticeService.js';
export { messageService } from './messageService.js';
export { translationService } from './translationService.js';
export { liveRandomService } from './liveRandomService.js';
export { blockService } from './blockService.js';
export { reportService } from './reportService.js';
export { notificationService } from './notificationService.js';
export { deviceBanService } from './deviceBanService.js';
export { appUpdateService } from './appUpdateService.js';
export { checkUserRoleFromAdminCollection } from './roles.js';
export { adminService } from './adminService.js';
export { contactBlockService } from './contactBlockService.js';
export { contactUploadService } from './contactUploadService.js';
export { photoUploadService } from './photoUploadService.js';
export { storageService } from './storageService.js';
export { verificationService } from './verificationService.js';
export { datePlanService } from './datePlanService.js';
export { clubService } from './clubService.js';
`;

fs.writeFileSync(path.join(OUT, 'index.js'), indexContent);

// Replace monolith with barrel re-export
fs.writeFileSync(
  SRC,
  `/** @deprecated Import from './firebase' — barrel re-export for backward compatibility */\nexport * from './firebase/index.js';\n`
);

console.log('Split complete:', OUT);
