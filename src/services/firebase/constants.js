/**
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
  deletionRequests: 'deletionRequests',
  crashLogs: 'crashLogs',
  crashGroups: 'crashGroups',
  appeals: 'appeals',
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
  return `${a}_${b}`;
}
