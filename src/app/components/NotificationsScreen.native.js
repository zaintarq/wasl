import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Bell, Heart, MessageCircle, Sparkles, Shield } from 'lucide-react-native';
import { authService, notificationService } from '../../services/firebaseService';
import { toPresenceDate } from '../../utils/presence';
import { tokens } from '../../ui/tokens';
import { shellStyles } from '../../ui/styles/shellStyles.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';

function formatWhen(createdAt) {
  const d = toPresenceDate(createdAt);
  if (!d) return '';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 60_000) return 'Just now';
  if (diffMs < 3_600_000) return `${Math.max(1, Math.floor(diffMs / 60_000))}m ago`;
  if (diffMs < 86_400_000) return `${Math.max(1, Math.floor(diffMs / 3_600_000))}h ago`;
  if (diffMs < 604_800_000) return `${Math.max(1, Math.floor(diffMs / 86_400_000))}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function iconForType(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('message')) return MessageCircle;
  if (t.includes('like') || t.includes('match')) return Heart;
  if (t.includes('verif')) return Shield;
  if (t.includes('update')) return Sparkles;
  return Bell;
}

function navigateFromNotification(onNavigate, item) {
  const type = String(item?.type || '').toLowerCase();
  const matchId = item?.matchId ? String(item.matchId) : null;

  if (type.includes('message') && matchId) {
    onNavigate('chat', { matchId });
    return;
  }
  if (
    type.includes('like') ||
    type.includes('match') ||
    type === 'match_request' ||
    type === 'match_approved' ||
    type === 'match_pending' ||
    type === 'match_mutual'
  ) {
    onNavigate('matches');
    return;
  }
  if (type.includes('verif')) {
    onNavigate('verification');
    return;
  }
  onNavigate('matches');
}

export function NotificationsScreen({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const meUid = authService.getCurrentUser()?.uid || null;

  useEffect(() => {
    if (!meUid) {
      onNavigate('onboarding', { mode: 'login' });
      return undefined;
    }

    setLoading(true);
    const unsub = notificationService.listenMyNotifications(meUid, ({ data, error }) => {
      if (error) {
        setItems([]);
        setLoading(false);
        return;
      }
      setItems(Array.isArray(data) ? data : []);
      setLoading(false);
    });

    return () => unsub && unsub();
  }, [meUid, onNavigate]);

  const unreadCount = useMemo(
    () => items.filter((n) => String(n?.status || '') === 'unread').length,
    [items]
  );

  const handlePress = useCallback(
    async (item) => {
      if (!meUid || !item?.id) return;
      if (String(item.status || '') === 'unread') {
        void notificationService.markRead(meUid, item.id);
      }
      navigateFromNotification(onNavigate, item);
    },
    [meUid, onNavigate]
  );

  const renderItem = useCallback(
    ({ item }) => {
      const unread = String(item?.status || '') === 'unread';
      const Icon = iconForType(item?.type);
      return (
        <HuzzPressable
          style={[styles.row, unread && styles.rowUnread]}
          onPress={() => handlePress(item)}
          haptic="light"
          accessibilityLabel={item?.title || 'Notification'}
        >
          <View style={[styles.iconTile, unread && styles.iconTileUnread]}>
            <Icon size={18} color={unread ? '#F7F1E8' : '#2B2420'} strokeWidth={2.2} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.title, unread && styles.titleUnread]} numberOfLines={1}>
              {item?.title || 'Notification'}
            </Text>
            {!!item?.body ? (
              <Text style={styles.body} numberOfLines={2}>
                {item.body}
              </Text>
            ) : null}
            <Text style={styles.time}>{formatWhen(item?.createdAt)}</Text>
          </View>
          {unread ? <View style={styles.dot} /> : null}
        </HuzzPressable>
      );
    },
    [handlePress]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={shellStyles.header}>
        <View style={shellStyles.headerSide}>
          <HuzzPressable
            style={shellStyles.headerBtn}
            onPress={() => onNavigate('home')}
            haptic="light"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={22} color={tokens.colors.textOnBrand} strokeWidth={2.2} />
          </HuzzPressable>
        </View>
        <Text style={shellStyles.headerTitle}>Notifications</Text>
        <View style={[shellStyles.headerSide, styles.headerRight]}>
          {unreadCount > 0 ? (
            <Text style={styles.unreadBadge}>{unreadCount}</Text>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={tokens.colors.brandPink} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Bell size={28} color="#2B2420" strokeWidth={2} />
          </View>
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptyText}>
            Likes, matches, and messages will show up here when something happens.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const INK = '#2B2420';
const CREAM = '#F7F1E8';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
  },
  headerRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  unreadBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.colors.textOnBrand,
    backgroundColor: tokens.colors.shellIconBtn,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  list: {
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderWidth: 1,
    borderColor: tokens.colors.shellRowBorder,
  },
  rowUnread: {
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderColor: 'rgba(43, 36, 32, 0.14)',
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CREAM,
    borderWidth: 2,
    borderColor: INK,
    transform: [{ rotate: '-3deg' }],
  },
  iconTileUnread: {
    backgroundColor: INK,
    borderWidth: 0,
    transform: [{ rotate: '-4deg' }],
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.textOnBrand,
  },
  titleUnread: {
    fontWeight: '800',
  },
  body: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textMutedOnBrand,
  },
  time: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: tokens.colors.textMutedOnBrand,
    opacity: 0.85,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.colors.brandPink,
    marginTop: 6,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: CREAM,
    borderWidth: 2,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.colors.textOnBrand,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textMutedOnBrand,
    textAlign: 'center',
  },
});
