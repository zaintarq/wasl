import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Share2, ImageDown, LayoutGrid } from 'lucide-react-native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { tokens } from '../../ui/tokens';
import {
  subscribeStoreScreenshotMode,
  setStoreScreenshotMode,
} from '../../services/storeScreenshotMode';
import {
  captureAppScreenshot,
  saveScreenshotToPhotos,
  shareScreenshot,
} from '../../services/storeScreenshotCapture';

export function StoreScreenshotOverlay({ onNavigate }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState(() => ({ active: false, label: '', homeRoute: 'admin', onStudio: true }));
  const [busy, setBusy] = useState(false);
  const [hiddenForCapture, setHiddenForCapture] = useState(false);
  const [lastUri, setLastUri] = useState(null);

  useEffect(() => subscribeStoreScreenshotMode(setMode), []);

  if (!mode.active || hiddenForCapture) return null;

  const goStudio = () => {
    setStoreScreenshotMode(true, { onStudio: true, label: 'Studio', homeRoute: mode.homeRoute });
    onNavigate('storeScreenshots');
  };

  const endSession = async () => {
    await setStoreScreenshotMode(false);
    onNavigate(mode.homeRoute);
  };

  const handleCapture = async () => {
    if (mode.onStudio) {
      Alert.alert('Pick a screen', 'Open a screen from the studio list first, then capture.');
      return;
    }
    setBusy(true);
    setHiddenForCapture(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 120));
      const uri = await captureAppScreenshot(mode.label);
      setLastUri(uri);
      Alert.alert('Captured', `${mode.label} saved locally. Save to Photos or Share below.`);
    } catch (e) {
      Alert.alert('Capture failed', e?.message || 'Could not capture screen.');
    } finally {
      setHiddenForCapture(false);
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!lastUri) {
      Alert.alert('No capture yet', 'Tap Capture first.');
      return;
    }
    setBusy(true);
    try {
      await saveScreenshotToPhotos(lastUri);
      Alert.alert('Saved', 'Screenshot added to your photo library.');
    } catch (e) {
      Alert.alert('Save failed', e?.message || 'Could not save to Photos.');
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    if (!lastUri) {
      Alert.alert('No capture yet', 'Tap Capture first.');
      return;
    }
    setBusy(true);
    try {
      await shareScreenshot(lastUri);
    } catch (e) {
      Alert.alert('Share failed', e?.message || 'Could not share screenshot.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.bar,
          {
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        <Text style={styles.label} numberOfLines={1}>
          {mode.onStudio ? 'Screenshot studio' : mode.label}
        </Text>

        <View style={styles.actions}>
          <HuzzPressable style={styles.btn} onPress={goStudio} disabled={busy} haptic="light">
            <LayoutGrid size={16} color="#fff" strokeWidth={2.25} />
            <Text style={styles.btnText}>Screens</Text>
          </HuzzPressable>

          {!mode.onStudio ? (
            <HuzzPressable style={[styles.btn, styles.btnPrimary]} onPress={handleCapture} disabled={busy} haptic="medium">
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Camera size={16} color="#fff" strokeWidth={2.25} />
                  <Text style={styles.btnText}>Capture</Text>
                </>
              )}
            </HuzzPressable>
          ) : null}

          {lastUri ? (
            <>
              <HuzzPressable style={styles.btn} onPress={handleSave} disabled={busy} haptic="light">
                <ImageDown size={16} color="#fff" strokeWidth={2.25} />
                <Text style={styles.btnText}>Photos</Text>
              </HuzzPressable>
              <HuzzPressable style={styles.btn} onPress={handleShare} disabled={busy} haptic="light">
                <Share2 size={16} color="#fff" strokeWidth={2.25} />
                <Text style={styles.btnText}>Share</Text>
              </HuzzPressable>
            </>
          ) : null}

          <HuzzPressable style={styles.btnMuted} onPress={endSession} disabled={busy} haptic="light">
            <Text style={styles.btnText}>Exit</Text>
          </HuzzPressable>
        </View>

        {Platform.OS === 'android' ? (
          <Text style={styles.hint}>Screenshots are allowed in this mode only.</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(190, 24, 93, 0.96)',
    borderTopWidth: 3,
    borderTopColor: '#831843',
    paddingTop: 10,
    paddingHorizontal: 12,
    zIndex: 9999,
    elevation: 24,
  },
  label: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#9D174D',
    borderWidth: 2,
    borderColor: '#831843',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 88,
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: '#DB2777',
  },
  btnMuted: {
    backgroundColor: '#4B5563',
    borderWidth: 2,
    borderColor: '#374151',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  hint: {
    marginTop: 6,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
  },
});
