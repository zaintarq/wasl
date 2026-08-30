import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Camera } from 'lucide-react-native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import { tokens } from '../../ui/tokens';
import { authService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import {
  STORE_SCREENSHOT_TARGETS,
  setStoreScreenshotMode,
} from '../../services/storeScreenshotMode';

export function StoreScreenshotStudio({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [homeRoute, setHomeRoute] = useState('admin');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const uid = authService.getCurrentUser()?.uid;
        if (!uid) {
          if (!cancelled) onNavigate('welcome');
          return;
        }
        const role = await checkUserRoleFromAdminCollection(uid);
        if (!role?.isAdmin && !role?.isStaff) {
          if (!cancelled) {
            Alert.alert('Access denied', 'Screenshot studio is for admin and staff only.');
            onNavigate('home');
          }
          return;
        }
        const route = role.isAdmin ? 'admin' : 'staff';
        if (!cancelled) {
          setAllowed(true);
          setHomeRoute(route);
          await setStoreScreenshotMode(true, {
            label: 'Studio',
            homeRoute: route,
            onStudio: true,
          });
        }
      } catch (e) {
        if (!cancelled) {
          Alert.alert('Error', e?.message || 'Could not open screenshot studio.');
          onNavigate('admin');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onNavigate]);

  const openTarget = async (target) => {
    await setStoreScreenshotMode(true, {
      label: target.label,
      homeRoute,
      onStudio: false,
    });
    onNavigate(target.nav, target.params || undefined);
  };

  const endSession = async () => {
    await setStoreScreenshotMode(false);
    onNavigate(homeRoute);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={tokens.colors.accent} />
        <Text style={styles.loadingText}>Opening screenshot studio…</Text>
      </SafeAreaView>
    );
  }

  if (!allowed) return null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <HuzzPressable style={styles.iconBtn} onPress={() => endSession()} haptic="light">
          <ArrowLeft size={22} color={tokens.colors.text} strokeWidth={2.25} />
        </HuzzPressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Screenshot studio</Text>
          <Text style={styles.subtitle}>Admin & staff only · Play Store captures</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <HuzzKeyboardAwareScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Camera size={20} color={tokens.colors.accent} strokeWidth={2.25} />
            <Text style={styles.cardTitle}>How it works</Text>
          </View>
          <Text style={styles.cardBody}>
            1. Open any screen below{'\n'}
            2. Use the pink capture bar at the bottom{'\n'}
            3. Save to Photos or Share{'\n'}
            4. Repeat for every screen you need
          </Text>
        </View>

        {STORE_SCREENSHOT_TARGETS.map((target) => (
          <HuzzPressable
            key={target.id}
            style={styles.row}
            onPress={() => openTarget(target)}
            haptic="light"
          >
            <Text style={styles.rowLabel}>{target.label}</Text>
            <Text style={styles.rowAction}>Open →</Text>
          </HuzzPressable>
        ))}

        <HuzzPressable style={styles.endBtn} onPress={() => endSession()} haptic="medium">
          <Text style={styles.endBtnText}>End session</Text>
        </HuzzPressable>
      </HuzzKeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
  },
  loadingText: {
    marginTop: 12,
    textAlign: 'center',
    fontWeight: '700',
    color: tokens.colors.text,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 3,
    borderBottomColor: tokens.colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: tokens.colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textMuted,
  },
  scroll: {
    padding: tokens.spacing.md,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 3,
    borderColor: tokens.colors.borderDark,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: tokens.colors.accent,
    textTransform: 'uppercase',
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: tokens.colors.borderDark,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    paddingHorizontal: tokens.spacing.md,
    marginBottom: tokens.spacing.sm,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: tokens.colors.text,
  },
  rowAction: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.colors.accent,
  },
  endBtn: {
    marginTop: tokens.spacing.md,
    backgroundColor: tokens.colors.gray,
    borderWidth: 2,
    borderColor: tokens.colors.borderDark,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  endBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: tokens.colors.text,
    textTransform: 'uppercase',
  },
});
