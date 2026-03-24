import React, { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { serverTimestamp } from 'firebase/firestore';
import { authService, userService } from '../../services/firebaseService';

const HEARTBEAT_MS = 45 * 1000;

/**
 * While the user is logged in and the app is in the foreground, periodically
 * writes `lastSeen` so other users can show Online / Last online …
 * On background, writes once more so "last seen" reflects when they left.
 */
export function PresenceHeartbeat() {
  const intervalRef = useRef(null);

  const tick = useCallback(() => {
    const u = authService.getCurrentUser();
    if (!u?.uid) return;
    userService.updateUser(u.uid, { lastSeen: serverTimestamp() }).catch(() => {});
  }, []);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    clearTimer();
    tick();
    intervalRef.current = setInterval(tick, HEARTBEAT_MS);
  }, [clearTimer, tick]);

  useEffect(() => {
    const unsubAuth = authService.onAuthStateChange((user) => {
      clearTimer();
      if (user?.uid) startHeartbeat();
    });

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (authService.getCurrentUser()?.uid) startHeartbeat();
      } else {
        tick();
        clearTimer();
      }
    });

    if (authService.getCurrentUser()?.uid) startHeartbeat();

    return () => {
      clearTimer();
      unsubAuth?.();
      sub?.remove?.();
    };
  }, [clearTimer, startHeartbeat, tick]);

  return null;
}
