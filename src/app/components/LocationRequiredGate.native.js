import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService, checkUserRoleFromAdminCollection, userService } from '../../services/firebaseService';
import { mehramService } from '../../services/mehramService';
import {
  detectCountryCity,
  getLocationPermissionStatus,
  openAppSettings,
  requestForegroundLocationPermission,
} from '../../services/locationService.native';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { tokens } from '../../ui/tokens';

function hasSavedLocation(profile) {
  const d = profile || {};
  if (d.locationPermission === 'granted') return true;
  return Boolean(String(d.country || d.city || d.countryOfResidence || '').trim());
}

/**
 * Ask for location once on first use. After city/country is saved on the profile,
 * do not block the app again if permission is later revoked.
 */
export function LocationRequiredGate() {
  const [checking, setChecking] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const skipRef = useRef(false);
  const runningRef = useRef(false);

  const persistLocation = useCallback(async (userId, res) => {
    if (!userId || res?.permission !== 'granted') return;
    await userService.updateMyLocation(userId, {
      country: res.country,
      city: res.city,
      locationPermission: 'granted',
      locationSetupComplete: true,
    });
  }, []);

  const evaluate = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setChecking(true);
    try {
      const user = authService.getCurrentUser();
      if (!user?.uid || mehramService.isMehramUid(user.uid)) {
        setBlocked(false);
        return;
      }

      try {
        const role = await checkUserRoleFromAdminCollection(user.uid);
        if (role?.isAdmin || role?.isStaff) {
          skipRef.current = true;
          setBlocked(false);
          return;
        }
        const profile = await userService.getUserById(user.uid);
        const waliRole = String(profile?.data?.role || '').toLowerCase();
        if (waliRole === 'wali') {
          skipRef.current = true;
          setBlocked(false);
          return;
        }
        if (hasSavedLocation(profile?.data) || profile?.data?.locationSetupComplete === true) {
          skipRef.current = true;
          setBlocked(false);
          return;
        }
      } catch {
        /* continue with gate */
      }

      skipRef.current = false;
      const perm = await getLocationPermissionStatus();
      if (perm.granted) {
        const loc = await detectCountryCity({ requestPermission: false });
        await persistLocation(user.uid, loc);
        setBlocked(false);
        setHint('');
        return;
      }

      setCanAskAgain(perm.canAskAgain !== false);
      setBlocked(true);
      setHint(
        perm.canAskAgain === false
          ? 'Location was denied. Open Settings → Huzz → Location → While Using the App, then return here.'
          : 'One-time setup: allow location so we can show your city/region for matching. You can continue without it, but nearby discovery works best with location.'
      );
    } finally {
      setChecking(false);
      runningRef.current = false;
    }
  }, [persistLocation]);

  useEffect(() => {
    evaluate();
    const unsub = authService.onAuthStateChange(() => evaluate());
    return () => unsub && unsub();
  }, [evaluate]);

  const onAllowPress = async () => {
    const user = authService.getCurrentUser();
    if (!user?.uid) return;
    setBusy(true);
    try {
      if (!canAskAgain) {
        openAppSettings();
        return;
      }
      const req = await requestForegroundLocationPermission();
      if (!req.granted) {
        setCanAskAgain(req.canAskAgain !== false);
        setBlocked(true);
        setHint(
          req.canAskAgain === false
            ? 'Enable location in Settings to finish setup.'
            : 'Location is needed once to set your area on your profile.'
        );
        return;
      }
      const loc = await detectCountryCity({ requestPermission: false });
      if (loc.permission !== 'granted') {
        setHint(loc.error || 'Could not detect your area. Try again or check Settings.');
        setBlocked(true);
        return;
      }
      await persistLocation(user.uid, loc);
      setBlocked(false);
      setHint('');
    } finally {
      setBusy(false);
    }
  };

  const onSkipPress = async () => {
    const user = authService.getCurrentUser();
    if (!user?.uid) return;
    setBusy(true);
    try {
      await userService.updateMyLocation(user.uid, {
        locationPermission: 'skipped',
        locationSetupComplete: true,
      });
      setBlocked(false);
      setHint('');
    } finally {
      setBusy(false);
    }
  };

  if (checking || !blocked || skipRef.current) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <SafeAreaView style={styles.cardWrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Set your area</Text>
          <Text style={styles.body}>{hint}</Text>
          {busy ? <ActivityIndicator color={tokens.colors.accent} style={{ marginVertical: 12 }} /> : null}
          <RetroButton
            variant="blue"
            title={canAskAgain ? 'Allow location' : 'Open Settings'}
            onPress={onAllowPress}
            disabled={busy}
          />
          <RetroButton
            variant="gray"
            title="Continue without location"
            onPress={onSkipPress}
            disabled={busy}
            style={{ marginTop: 10 }}
          />
          {!canAskAgain ? (
            <RetroButton
              variant="gray"
              title="I enabled it — check again"
              onPress={evaluate}
              disabled={busy}
              style={{ marginTop: 10 }}
            />
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    zIndex: 9999,
    elevation: 9999,
  },
  cardWrap: { flex: 1, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  body: { fontSize: 15, lineHeight: 22, color: '#334155', marginBottom: 16 },
});
