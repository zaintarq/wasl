import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { authService, appUpdateService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { getPlayStoreOpenUrl, PLAY_STORE_WEB_URL } from '../../config/appStore';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { tokens } from '../../ui/tokens';

function compareSemver(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Full-screen gate when admin broadcasts an app update alert.
 */
export function AppUpdateAlertGate() {
  const [checking, setChecking] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [alert, setAlert] = useState(null);
  const [opening, setOpening] = useState(false);
  const skipRef = useRef(false);

  const evaluateAlert = useCallback((data) => {
    if (skipRef.current || !data?.active) {
      setBlocked(false);
      setAlert(null);
      return;
    }

    const minVersion = String(data?.minVersion || '').trim();
    const currentVersion = Application.nativeApplicationVersion || '0';
    if (minVersion && compareSemver(currentVersion, minVersion) >= 0) {
      setBlocked(false);
      setAlert(null);
      return;
    }

    setAlert(data);
    setBlocked(true);
  }, []);

  useEffect(() => {
    let unsubAlert = () => {};
    let cancelled = false;

    const boot = async () => {
      setChecking(true);
      try {
        const user = authService.getCurrentUser();
        if (!user?.uid) {
          skipRef.current = false;
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
        } catch {
          /* continue */
        }

        skipRef.current = false;
        unsubAlert = appUpdateService.listenCurrentAlert(({ data }) => {
          if (!cancelled) evaluateAlert(data);
        });
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    boot();
    const unsubAuth = authService.onAuthStateChange(() => boot());

    return () => {
      cancelled = true;
      unsubAlert();
      unsubAuth && unsubAuth();
    };
  }, [evaluateAlert]);

  const openStore = async () => {
    setOpening(true);
    try {
      const custom = String(alert?.playStoreUrl || '').trim();
      const primary = getPlayStoreOpenUrl(custom);
      const fallback = custom || PLAY_STORE_WEB_URL;
      try {
        const ok = await Linking.canOpenURL(primary);
        if (ok) {
          await Linking.openURL(primary);
          return;
        }
      } catch {
        /* fall through */
      }
      await Linking.openURL(fallback);
    } catch {
      try {
        await Linking.openURL(PLAY_STORE_WEB_URL);
      } catch {
        /* ignore */
      }
    } finally {
      setOpening(false);
    }
  };

  if (checking || !blocked || !alert) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <SafeAreaView style={styles.cardWrap}>
        <View style={styles.card}>
          <Text style={styles.emoji}>📲</Text>
          <Text style={styles.title}>{String(alert?.title || 'Update required')}</Text>
          <Text style={styles.body}>
            {String(
              alert?.body ||
                'A new version of Huzz is available. Update from the Play Store to keep using the app.'
            )}
          </Text>
          {Application.nativeApplicationVersion ? (
            <Text style={styles.version}>
              Your version: {Application.nativeApplicationVersion}
              {alert?.minVersion ? ` · Required: ${alert.minVersion}` : ''}
            </Text>
          ) : null}
          {opening ? (
            <ActivityIndicator color={tokens.colors.accent} style={{ marginVertical: 14 }} />
          ) : null}
          <RetroButton variant="blue" title="Update on Play Store" onPress={openStore} disabled={opening} />
          <Text style={styles.hint}>
            {Platform.OS === 'android'
              ? 'Opens Google Play so you can update instantly.'
              : 'Opens the store page for this app.'}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    zIndex: 10000,
    elevation: 10000,
  },
  cardWrap: { flex: 1, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  emoji: { fontSize: 40, marginBottom: 12 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#334155',
    textAlign: 'center',
    marginBottom: 12,
  },
  version: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 16,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 14,
    textAlign: 'center',
    lineHeight: 17,
  },
});
