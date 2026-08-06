import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, UserX } from 'lucide-react-native';

import { authService, blockService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { RetroButton } from '../../ui/components/RetroButton.native';

const cardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
      }
    : { elevation: 3 };

export function BlockedUsersScreen({ onNavigate }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    const uid = authService.getCurrentUser()?.uid;
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await blockService.listBlockedUsers(uid);
      if (error) {
        console.warn('[BlockedUsers]', error);
        setRows([]);
      } else {
        setRows(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onUnblock = (item) => {
    const uid = authService.getCurrentUser()?.uid;
    if (!uid) return;
    Alert.alert('Unblock?', `Remove ${item.name} from your blocked list? You can chat again if you connect.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          try {
            const { error } = await blockService.unblockUser(uid, item.id);
            if (error) {
              Alert.alert('Error', error);
              return;
            }
            setRows((prev) => prev.filter((r) => r.id !== item.id));
          } catch (e) {
            Alert.alert('Error', e?.message || 'Failed to unblock.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#FFF5F7', '#EFF6FF', '#F0FDFA']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.safe}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={styles.headerRow}>
            <HuzzPressable style={styles.headerSideBtn} onPress={() => onNavigate('settings')} haptic="light">
              <ArrowLeft size={22} color={tokens.colors.text} strokeWidth={2.25} />
            </HuzzPressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>Blocked users</Text>
            </View>
            <View style={[styles.headerSideBtn, styles.headerRightBtn]} />
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={tokens.colors.accent} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : null}

        {!loading && rows.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyCard, cardShadow]}>
              <UserX size={40} color={tokens.colors.textMuted} strokeWidth={1.8} />
              <Text style={styles.emptyTitle}>No blocked users</Text>
              <Text style={styles.emptyHint}>
                People you block from chat will show up here. You can unblock them anytime.
              </Text>
            </View>
          </View>
        ) : null}

        {!loading && rows.length > 0 ? (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: tokens.spacing.xl + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={[styles.rowCard, cardShadow]}>
                <View style={styles.rowLeft}>
                  {item.photoUrl ? (
                    <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarLetter}>{String(item.name || '?').trim().charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.rowSub}>Blocked</Text>
                  </View>
                </View>
                <RetroButton
                  variant="gray"
                  title="Unblock"
                  onPress={() => onUnblock(item)}
                  style={styles.unblockBtn}
                />
              </View>
            )}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.filterBgRose,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
    paddingHorizontal: tokens.spacing.sm,
    paddingBottom: tokens.spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  headerSideBtn: {
    minWidth: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  headerRightBtn: {
    minWidth: 76,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.colors.text,
    letterSpacing: -0.3,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacing.xl,
    gap: 12,
  },
  loadingText: {
    ...tokens.typography.body,
    color: tokens.colors.textSecondary,
  },
  emptyWrap: {
    flex: 1,
    padding: tokens.spacing.md,
    justifyContent: 'center',
  },
  emptyCard: {
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    backgroundColor: tokens.colors.filterBgEmerald,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderEmerald,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  emptyHint: {
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    padding: tokens.spacing.md,
    gap: 12,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: tokens.colors.surfaceElevated,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.colors.textSecondary,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  rowSub: {
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  unblockBtn: {
    minWidth: 100,
    paddingHorizontal: 8,
  },
});
