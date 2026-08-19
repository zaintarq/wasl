import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { authService, userService } from '../../services/firebaseService';
import { ageAssuranceService } from '../../services/ageAssuranceService';
import { getZoiVeraApiKey, getAgeVerifyHostedUrl } from '../../config/ageVerify';
import { hasPassedAgeCheck } from '../../utils/ageCheck.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { tokens } from '../../ui/tokens';

export function AgeCheckScreen({ onNavigate }) {
  const [phase, setPhase] = useState('intro'); // intro | scan
  const [busy, setBusy] = useState(false);
  const [scanError, setScanError] = useState('');
  const [webSource, setWebSource] = useState(null);
  const [webSourceLoading, setWebSourceLoading] = useState(false);
  const browserPendingRef = useRef(false);
  const uid = authService.getCurrentUser()?.uid || '';
  const apiKey = getZoiVeraApiKey();
  const browserScanUrl = uid ? getAgeVerifyHostedUrl(uid) : '';

  const finishSuccess = useCallback(
    async (attestationJwt) => {
      setBusy(true);
      try {
        const { error } = await ageAssuranceService.finalize(attestationJwt);
        if (error) {
          Alert.alert('Verification failed', error);
          return;
        }
        if (uid) await userService.getUserById(uid).catch(() => {});
        Alert.alert("You're verified", 'You can now like, match, chat, go live, and join clubs.', [
          { text: 'Continue', onPress: () => onNavigate?.('home') },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [onNavigate, uid]
  );

  const onMessage = useCallback(
    (event) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data || '{}');
        if (msg.type === 'success' && msg.attestationJwt) {
          finishSuccess(msg.attestationJwt);
          return;
        }
        if (msg.type === 'error' && msg.message) {
          setScanError(String(msg.message));
        }
        if (msg.type === 'failed' && msg.reason) {
          setScanError(String(msg.reason));
        }
      } catch {
        /* ignore */
      }
    },
    [finishSuccess]
  );

  useEffect(() => {
    if (phase !== 'scan' || !uid) return undefined;
    setWebSourceLoading(true);
    // Firebase-hosted page — real HTTPS origin, API key injected server-side (most reliable in WebView)
    setWebSource({
      source: { uri: getAgeVerifyHostedUrl(uid) },
      cacheKey: `hosted-${uid}-${Date.now()}`,
      readAccessUrl: null,
    });
    setWebSourceLoading(false);
    return undefined;
  }, [phase, uid]);

  const startScan = useCallback(async () => {
    setScanError('');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(
        'Camera required',
        'Allow camera access to run the face scan. You can enable it in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings?.() },
        ]
      );
      return;
    }
    setPhase('scan');
  }, []);

  const checkBrowserVerification = useCallback(async () => {
    if (!uid || !browserPendingRef.current) return;
    try {
      const snap = await userService.getUserById(uid);
      if (hasPassedAgeCheck(snap?.data)) {
        browserPendingRef.current = false;
        Alert.alert("You're verified", 'You can now like, match, chat, go live, and join clubs.', [
          { text: 'Continue', onPress: () => onNavigate?.('home') },
        ]);
      }
    } catch {
      /* ignore */
    }
  }, [onNavigate, uid]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkBrowserVerification();
      }
    });
    return () => sub.remove();
  }, [checkBrowserVerification]);

  const openInBrowser = useCallback(async () => {
    if (!browserScanUrl) return;
    try {
      browserPendingRef.current = true;
      await Linking.openURL(browserScanUrl);
      Alert.alert(
        'Finish in browser',
        'Complete the face scan in Safari or Chrome, then return to Huzz. We will check automatically when you come back.',
        [{ text: 'OK' }]
      );
    } catch {
      browserPendingRef.current = false;
      setScanError('Could not open browser for face scan.');
    }
  }, [browserScanUrl]);

  if (!uid) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Sign in to verify your age.</Text>
        <RetroButton
          title="Log in"
          onPress={() => onNavigate?.('onboarding', { mode: 'login' })}
          style={{ marginTop: 16, marginHorizontal: 24 }}
        />
      </SafeAreaView>
    );
  }

  if (!apiKey) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>ZoiVera API key missing. Restart Expo after updating .env.</Text>
      </SafeAreaView>
    );
  }

  if (phase === 'intro') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <HuzzPressable onPress={() => onNavigate?.('home')} haptic="light" style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back to home">
            <ArrowLeft size={22} color={tokens.colors.text} />
          </HuzzPressable>
          <Text style={styles.title}>18+ age check</Text>
          <View style={styles.backBtn} />
        </View>
        <ScrollView contentContainerStyle={styles.introScroll}>
          <View style={styles.introIcon}>
            <ShieldCheck size={36} color={tokens.colors.blue} strokeWidth={2} />
          </View>
          <Text style={styles.introTitle}>Quick face scan</Text>
          <Text style={styles.introBody}>
            Verify once to unlock likes, matches, chat, live, and clubs. The scan runs on your device —
            Huzz only receives a signed pass/fail. No photos are uploaded.
          </Text>
          <Text style={styles.introHint}>
            Allow camera access when prompted. Use good lighting and face the front camera.
          </Text>
          {scanError ? <Text style={styles.introError}>{scanError}</Text> : null}
          <RetroButton variant="blue" title="Start face scan" onPress={startScan} style={styles.introBtn} />
          <RetroButton
            variant="outline"
            title="Open in browser instead"
            onPress={openInBrowser}
            style={styles.browserBtn}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <HuzzPressable
          onPress={() => {
            setPhase('intro');
            setScanError('');
            setWebSource(null);
          }}
          haptic="light"
          style={styles.backBtn}
        >
          <ArrowLeft size={22} color={tokens.colors.text} />
        </HuzzPressable>
        <Text style={styles.title}>Face scan</Text>
        <View style={styles.backBtn} />
      </View>

      {scanError ? (
        <View style={styles.scanErrorBar}>
          <Text style={styles.scanErrorText} numberOfLines={4}>
            {scanError}
          </Text>
        </View>
      ) : null}

      {busy ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.busyText}>Saving verification…</Text>
        </View>
      ) : null}

      {webSourceLoading || !webSource ? (
        <View style={styles.webLoading}>
          <ActivityIndicator color={tokens.colors.blue} size="large" />
          <Text style={styles.loadingText}>Preparing scanner…</Text>
        </View>
      ) : (
        <WebView
          key={webSource.cacheKey}
          source={webSource.source}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          originWhitelist={['*']}
          allowingReadAccessToURL={webSource.readAccessUrl || undefined}
          mixedContentMode="always"
          androidLayerType="hardware"
          sharedCookiesEnabled
          onPermissionRequest={(req) => {
            try {
              req.grant(req.resources);
            } catch {
              /* ignore */
            }
          }}
          onError={(e) => {
            setScanError(
              e?.nativeEvent?.description ||
                'Could not load scanner. Try "Open in browser instead" on the previous screen.'
            );
          }}
          onHttpError={(e) => {
            const code = e?.nativeEvent?.statusCode;
            if (code === 503) {
              setScanError('Age scanner not configured on server yet. Try again in a minute.');
            } else if (code && code >= 400) {
              setScanError(`Scanner unavailable (${code}).`);
            }
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.webLoading}>
              <ActivityIndicator color={tokens.colors.blue} size="large" />
              <Text style={styles.loadingText}>Loading scanner…</Text>
            </View>
          )}
          style={styles.webview}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0f172a' },
  introScroll: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  introIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: tokens.colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  introTitle: { fontSize: 24, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 12 },
  introBody: { fontSize: 16, lineHeight: 24, color: '#475569', textAlign: 'center', marginBottom: 12 },
  introHint: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 16 },
  introError: { fontSize: 14, color: '#b91c1c', textAlign: 'center', marginBottom: 12, lineHeight: 20 },
  introBtn: { width: '100%' },
  browserBtn: { width: '100%', marginTop: 10 },
  webview: { flex: 1, backgroundColor: tokens.colors.bg },
  webLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.colors.bg },
  loadingText: { marginTop: 12, color: '#64748b', fontSize: 14 },
  scanErrorBar: {
    backgroundColor: '#fef2f2',
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scanErrorText: { color: '#b91c1c', fontSize: 13, lineHeight: 18 },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  busyText: { marginTop: 12, color: '#fff', fontSize: 15, fontWeight: '600' },
  errorText: { padding: 24, fontSize: 16, color: '#334155', textAlign: 'center' },
});
