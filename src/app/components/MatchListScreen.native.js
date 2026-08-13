import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { MessageCircle } from 'lucide-react-native';
import { authService, matchService, userService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { blockIfAgeNotVerified } from '../../utils/ageCheck.native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '../../ui/tokens';
import { shellStyles } from '../../ui/styles/shellStyles.native';
import { SkeletonBox } from '../../ui/components/SkeletonBox.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { MainBottomNav, mainBottomNavClearance } from '../../ui/components/MainBottomNav.native';
import { LIVE_SCREEN_GUTTER } from '../../ui/components/live/LiveContentWidth.native';
import { LiveContentWidth } from '../../ui/components/live/LiveContentWidth.native';
import {
  LiveTypographyProvider,
  LiveText,
  LiveRetroButton,
} from '../../ui/components/live/LiveTypography.native';
import { welcomeButtonStyles } from '../../ui/styles/welcomeButtonStyles.native';
import { ChatLobbyHero } from '../../ui/components/chats/ChatLobbyHero.native';
import { ChatFeatureGrid } from '../../ui/components/chats/ChatFeatureGrid.native';
import { ChatSafetyNote } from '../../ui/components/chats/ChatSafetyNote.native';
import { ChatMatchCard } from '../../ui/components/chats/ChatMatchCard.native';

export function MatchListScreen({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [bottomNavH, setBottomNavH] = useState(0);
  const [myProfile, setMyProfile] = useState(null);
  const [roleCheck, setRoleCheck] = useState(null);

  const meUid = authService.getCurrentUser()?.uid || null;

  useEffect(() => {
    if (!meUid) return;
    userService.getUserById(meUid).then((res) => setMyProfile(res?.data || null)).catch(() => {});
    checkUserRoleFromAdminCollection(meUid).then(setRoleCheck).catch(() => {});
  }, [meUid]);

  useEffect(() => {
    const authUser = authService.getCurrentUser();
    if (!authUser) {
      onNavigate('onboarding', { mode: 'login' });
      return undefined;
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
      const canChat = status === 'active' || status === 'pending';
      return { match: m, otherUid, other, status, canChat };
    });
  }, [matches, usersById, meUid]);

  const navClearance = mainBottomNavClearance(bottomNavH, 12);

  const openChat = async (match, otherUid, status) => {
    const uid = authService.getCurrentUser()?.uid;
    if (!uid || !otherUid) return;
    if (blockIfAgeNotVerified(myProfile, onNavigate, roleCheck)) return;
    if (status === 'pending') {
      await matchService.createActiveMatch(uid, otherUid, { initiatedBy: uid });
    }
    onNavigate('chat', { matchId: match.id, userId: otherUid });
  };

  const handleUnmatch = (match, other) => {
    Alert.alert(
      'Remove connection?',
      `Stop chatting with ${other?.name || 'this person'}? You can connect again from Home if you both like each other.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
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

  const listHeader = (
    <>
      <ChatLobbyHero />
      <ChatFeatureGrid />
      {!loading && rows.length > 0 ? (
        <LiveContentWidth style={styles.section}>
          <LiveText style={styles.sectionTitle}>Your conversations</LiveText>
        </LiveContentWidth>
      ) : null}
    </>
  );

  const listFooter = (
    <>
      {!loading && rows.length === 0 ? (
        <LiveContentWidth style={styles.emptyWrap}>
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MessageCircle size={36} color={tokens.colors.textOnBrand} strokeWidth={1.5} />
            </View>
            <LiveText style={styles.emptyTitle}>No chats yet</LiveText>
            <LiveText style={styles.emptyText}>
              Like people on Home — when you both connect, your conversation shows up here.
            </LiveText>
          </View>
        </LiveContentWidth>
      ) : null}
      <ChatSafetyNote />
      <LiveContentWidth style={styles.ctaStack}>
        <LiveRetroButton
          variant="primary"
          onPress={() => onNavigate('home')}
              style={[styles.cta, welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.welcomeBtnPrimaryShadow]}
              textStyle={welcomeButtonStyles.welcomeBtnLabel}
        >
          Find people on Home
        </LiveRetroButton>
      </LiveContentWidth>
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LiveTypographyProvider>
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <LiveText style={styles.title}>Chats</LiveText>
          <View style={styles.headerSide} />
        </View>

        <FlatList
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: navClearance }]}
          initialNumToRender={12}
          windowSize={8}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={16}
          removeClippedSubviews
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          data={loading ? Array.from({ length: 4 }).map((_, i) => ({ _skeleton: true, id: `sk-${i}` })) : rows}
          keyExtractor={(item) => String(item?.match?.id || item?.id)}
          renderItem={({ item }) => {
            if (item?._skeleton) {
              return (
                <LiveContentWidth>
                  <View style={styles.skeletonRow}>
                    <SkeletonBox style={styles.skeletonAvatar} />
                    <View style={{ flex: 1, gap: 8 }}>
                      <SkeletonBox style={{ height: 14, width: '55%' }} />
                      <SkeletonBox style={{ height: 10, width: '70%' }} />
                    </View>
                  </View>
                </LiveContentWidth>
              );
            }

            const { match, otherUid, other, status, canChat } = item;

            const card = (
              <ChatMatchCard
                other={other}
                match={match}
                canChat={canChat}
                onPress={() => openChat(match, otherUid, status)}
              />
            );

            if (!canChat) {
              return <LiveContentWidth>{card}</LiveContentWidth>;
            }

            return (
              <LiveContentWidth>
                <Swipeable
                  renderLeftActions={() => (
                    <View style={styles.unmatchAction}>
                      <HuzzPressable
                        style={styles.unmatchBtn}
                        onPress={() => handleUnmatch(match, other)}
                        haptic="medium"
                      >
                        <LiveText style={styles.unmatchText}>Remove</LiveText>
                      </HuzzPressable>
                    </View>
                  )}
                >
                  {card}
                </Swipeable>
              </LiveContentWidth>
            );
          }}
        />

        <MainBottomNav active="chats" onNavigate={onNavigate} onLayout={setBottomNavH} />
      </LiveTypographyProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.bg },
  list: { flex: 1 },
  listContent: {
    paddingTop: tokens.spacing.md,
    flexGrow: 1,
  },
  header: {
    ...shellStyles.header,
    paddingHorizontal: LIVE_SCREEN_GUTTER,
    paddingVertical: 14,
  },
  headerSide: shellStyles.headerSide,
  title: shellStyles.headerTitle,
  section: { marginBottom: 4 },
  sectionTitle: shellStyles.sectionTitle,
  skeletonRow: {
    ...shellStyles.listRow,
    paddingHorizontal: 14,
  },
  skeletonAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  emptyWrap: { marginBottom: tokens.spacing.lg },
  empty: shellStyles.emptyBlock,
  emptyIcon: shellStyles.emptyIcon,
  emptyTitle: shellStyles.emptyTitle,
  emptyText: shellStyles.emptyText,
  ctaStack: { marginBottom: tokens.spacing.md },
  cta: { width: '100%' },
  unmatchAction: {
    justifyContent: 'center',
    marginBottom: 10,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  unmatchBtn: {
    width: 88,
    height: '100%',
    minHeight: 72,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tokens.colors.danger,
  },
  unmatchText: {
    ...tokens.typography.label,
    color: '#FFFFFF',
  },
});
