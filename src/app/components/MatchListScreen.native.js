import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { authService, matchService, userService } from '../../services/firebaseService';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '../../ui/tokens';
import { SkeletonBox } from '../../ui/components/SkeletonBox.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { getPresenceDisplay } from '../../utils/presence';

export function MatchListScreen({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState([]);
  const [usersById, setUsersById] = useState({});

  const meUid = authService.getCurrentUser()?.uid || null;

  // Real-time match list: updates when the other person approves or new messages
  useEffect(() => {
    const authUser = authService.getCurrentUser();
    if (!authUser) {
      onNavigate('onboarding', { mode: 'login' });
      return;
    }
    setLoading(true);
    const unsub = matchService.listenMyMatches(authUser.uid, ({ data: list, error }) => {
      if (error) {
        setMatches([]);
        setLoading(false);
        return;
      }
      const arr = Array.isArray(list) ? list : [];
      setMatches(arr);
      setLoading(false);
      // Load other-user profiles when list changes (best-effort)
      const otherUids = Array.from(
        new Set(
          arr
            .map((m) => (m?.uids || []).find((u) => u !== authUser.uid))
            .filter(Boolean)
            .map(String)
        )
      );
      Promise.all(
        otherUids.map(async (uid) => {
          const res = await userService.getUserById(uid);
          return [uid, res?.data || null];
        })
      ).then((profilePairs) => {
        setUsersById((prev) => ({ ...prev, ...Object.fromEntries(profilePairs) }));
      });
    });
    return () => unsub && unsub();
  }, [onNavigate]);

  const rows = useMemo(() => {
    return matches.map((m) => {
      const otherUid = (m?.uids || []).find((u) => u !== meUid) || null;
      const other = otherUid ? usersById[otherUid] : null;
      const status = String(m?.status || 'active');
      const isReceiver = meUid && String(m?.requestedTo || '') === String(meUid);
      const canChat = status === 'active';
      return { match: m, otherUid, other, status, isReceiver, canChat };
    });
  }, [matches, usersById, meUid]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <HuzzPressable style={styles.headerBtn} onPress={() => onNavigate('home')} haptic="light">
          <Text style={styles.headerBtnText}>← Back</Text>
        </HuzzPressable>
        <Text style={styles.title}>Matches</Text>
        <View style={{ width: 70 }} />
      </View>

      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 22 }}
        initialNumToRender={12}
        windowSize={8}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={16}
        removeClippedSubviews
        keyboardDismissMode="on-drag"
        data={loading ? Array.from({ length: 6 }).map((_, i) => ({ _skeleton: true, id: `sk-${i}` })) : rows}
        keyExtractor={(item) => String(item?.match?.id || item?.id)}
        renderItem={({ item }) => {
          if (item?._skeleton) {
            return (
              <View style={styles.matchRow}>
                <View style={{ flex: 1, gap: 8 }}>
                  <SkeletonBox style={{ height: 14, width: '55%' }} />
                  <SkeletonBox style={{ height: 10, width: '35%' }} />
                </View>
                <SkeletonBox style={{ height: 12, width: 56 }} />
              </View>
            );
          }
          const { match, otherUid, other, status, isReceiver, canChat } = item;
          const handleUnmatch = () => {
            Alert.alert(
              'Unmatch?',
              `Remove match with ${other?.name || 'this person'}? You will no longer be able to chat.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Unmatch',
                  style: 'destructive',
                  onPress: async () => {
                    const uid = authService.getCurrentUser()?.uid;
                    if (!uid) return;
                    const { error } = await matchService.unmatch(match.id, uid);
                    if (error) Alert.alert('Error', error);
                  },
                },
              ]
            );
          };

          const rowContent = (
            <HuzzPressable
              style={styles.matchRow}
              onPress={() => {
                if (canChat) onNavigate('chat', { matchId: match.id, userId: otherUid });
              }}
              haptic="light"
              disabled={!canChat}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.matchName}>{other?.name || 'Match'}</Text>
                <Text style={styles.matchMeta}>
                  {status === 'pending'
                    ? isReceiver
                      ? 'Match request pending your approval'
                      : 'Pending approval'
                    : (() => {
                        const p = getPresenceDisplay(other?.lastSeen);
                        if (p && canChat) return p.label;
                        return other?.categoryIntent || '';
                      })()}
                </Text>
              </View>
              {status === 'pending' && isReceiver ? (
                <HuzzPressable
                  style={styles.approveBtn}
                  onPress={async () => {
                    const uid = authService.getCurrentUser()?.uid;
                    if (!uid) return;
                    const { error } = await matchService.approveMatch(match.id, uid);
                    if (!error) onNavigate('chat', { matchId: match.id, userId: otherUid });
                  }}
                  haptic="medium"
                >
                  <Text style={styles.approveText}>Approve</Text>
                </HuzzPressable>
              ) : (
                <Text style={[styles.openChat, !canChat ? { opacity: 0.5 } : null]}>{canChat ? 'Chat →' : '⏳'}</Text>
              )}
            </HuzzPressable>
          );

          if (canChat) {
            return (
              <Swipeable
                key={match.id}
                renderLeftActions={() => (
                  <View style={styles.unmatchAction}>
                    <HuzzPressable style={styles.unmatchBtn} onPress={handleUnmatch} haptic="medium">
                      <Text style={styles.unmatchText}>Unmatch</Text>
                    </HuzzPressable>
                  </View>
                )}
              >
                {rowContent}
              </Swipeable>
            );
          }
          return rowContent;
        }}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No matches yet</Text>
              <Text style={styles.emptyText}>Start liking profiles to get matches.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  headerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    minWidth: 70,
    alignItems: 'center',
  },
  headerBtnText: { ...tokens.typography.label, color: tokens.colors.text },
  title: { ...tokens.typography.titleSmall, color: tokens.colors.text },
  emptyBox: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: 24,
    marginTop: 24,
  },
  emptyTitle: { ...tokens.typography.titleSmall, color: tokens.colors.text, marginBottom: 8 },
  emptyText: { ...tokens.typography.bodySmall, color: tokens.colors.textSecondary },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  matchName: { ...tokens.typography.body, fontWeight: '600', color: tokens.colors.text },
  matchMeta: { ...tokens.typography.caption, color: tokens.colors.textMuted, marginTop: 4 },
  openChat: { ...tokens.typography.label, color: tokens.colors.accent },
  approveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.success,
  },
  approveText: { ...tokens.typography.label, color: '#FFFFFF' },
  unmatchAction: {
    justifyContent: 'center',
    marginBottom: 10,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  unmatchBtn: {
    width: 88,
    height: '100%',
    minHeight: 64,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tokens.colors.danger,
  },
  unmatchText: {
    ...tokens.typography.label,
    color: '#FFFFFF',
  },
});


