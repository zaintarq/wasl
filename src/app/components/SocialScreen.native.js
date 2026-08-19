import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '../../services/firebaseService';
import { loadSocialFriends } from '../../services/socialFriendsService';
import { GAMES_CATALOG } from '../../config/gamesCatalog';
import { tokens } from '../../ui/tokens';
import { shellStyles } from '../../ui/styles/shellStyles.native';
import { MainBottomNav, mainBottomNavClearance } from '../../ui/components/MainBottomNav.native';
import { LiveTypographyProvider, LiveText } from '../../ui/components/live/LiveTypography.native';
import { SocialFriendChip } from '../../ui/components/social/SocialFriendChip.native';
import { GameTile } from '../../ui/components/social/GameTile.native';

export function SocialScreen({ onNavigate }) {
  const meUid = authService.getCurrentUser()?.uid || null;
  const [bottomNavH, setBottomNavH] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matches, setMatches] = useState([]);
  const [clubFriends, setClubFriends] = useState([]);
  const [selectedOpponent, setSelectedOpponent] = useState(null);

  const navClearance = mainBottomNavClearance(bottomNavH, 12);

  const load = useCallback(async () => {
    if (!meUid) {
      onNavigate('onboarding', { mode: 'login' });
      return;
    }
    const res = await loadSocialFriends(meUid);
    setMatches(res.matches || []);
    setClubFriends(res.clubFriends || []);
    setLoading(false);
    setRefreshing(false);
  }, [meUid, onNavigate]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const openGame = useCallback(
    (gameId, opponent) => {
      onNavigate('gamePlay', {
        gameId,
        opponentUid: opponent?.uid || selectedOpponent?.uid || null,
        opponentName: opponent?.name || selectedOpponent?.name || null,
      });
    },
    [onNavigate, selectedOpponent]
  );

  const handleFriendPlay = useCallback(
    (user) => {
      setSelectedOpponent(user);
      openGame('ludo', user);
    },
    [openGame]
  );

  const friendsCombined = useMemo(() => {
    const map = new Map();
    [...clubFriends, ...matches].forEach((u) => {
      if (u?.uid) map.set(String(u.uid), u);
    });
    return [...map.values()];
  }, [clubFriends, matches]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LiveTypographyProvider>
        <View style={shellStyles.header}>
          <View style={shellStyles.headerSide} />
          <LiveText style={shellStyles.headerTitle}>Social</LiveText>
          <View style={shellStyles.headerSide} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={tokens.colors.brandPink} />
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: navClearance }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.colors.brandPink} />
            }
          >
            {selectedOpponent ? (
              <View style={styles.selectedBanner}>
                <LiveText style={styles.selectedText}>
                  Playing with {selectedOpponent.name?.split(' ')[0] || 'friend'} — pick a game below
                </LiveText>
              </View>
            ) : null}

            <LiveText style={styles.sectionTitle}>Club friends</LiveText>
            {clubFriends.length === 0 ? (
              <LiveText style={styles.emptyLine}>Join a club to see friends here.</LiveText>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
                {clubFriends.map((user) => (
                  <SocialFriendChip
                    key={user.uid}
                    user={user}
                    selected={selectedOpponent?.uid === user.uid}
                    onPress={setSelectedOpponent}
                    onPlayPress={handleFriendPlay}
                  />
                ))}
              </ScrollView>
            )}

            <LiveText style={styles.sectionTitle}>Matches</LiveText>
            {matches.length === 0 ? (
              <LiveText style={styles.emptyLine}>Your matches will show up here.</LiveText>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
                {matches.map((user) => (
                  <SocialFriendChip
                    key={user.uid}
                    user={user}
                    selected={selectedOpponent?.uid === user.uid}
                    onPress={setSelectedOpponent}
                    onPlayPress={handleFriendPlay}
                  />
                ))}
              </ScrollView>
            )}

            <LiveText style={styles.sectionTitle}>Play games</LiveText>
            <LiveText style={styles.sectionCaption}>Phaser games · Colyseus multiplayer · secure token</LiveText>
            <View style={styles.gameGrid}>
              {GAMES_CATALOG.map((game, index) => (
                <GameTile key={game.id} game={game} index={index} onPress={(g) => openGame(g.id)} />
              ))}
            </View>

            {friendsCombined.length > 0 ? (
              <>
                <LiveText style={[styles.sectionTitle, { marginTop: 8 }]}>Quick play</LiveText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
                  {GAMES_CATALOG.slice(0, 4).map((game, index) => (
                    <GameTile
                      key={`quick-${game.id}`}
                      game={game}
                      index={index}
                      compact
                      onPress={(g) => openGame(g.id, selectedOpponent)}
                    />
                  ))}
                </ScrollView>
              </>
            ) : null}
          </ScrollView>
        )}

        <MainBottomNav
          active="social"
          onNavigate={onNavigate}
          onLayout={setBottomNavH}
          onProfilePress={() => onNavigate('myProfile')}
          onSettingsPress={() => onNavigate('settings')}
        />
      </LiveTypographyProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingTop: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    ...shellStyles.sectionTitle,
    marginTop: 16,
    marginBottom: 10,
  },
  sectionCaption: {
    fontSize: 12,
    color: tokens.colors.textMutedOnBrand,
    marginBottom: 12,
    marginTop: -4,
  },
  emptyLine: {
    fontSize: 13,
    color: tokens.colors.textMutedOnBrand,
    marginBottom: 8,
  },
  hRow: {
    paddingBottom: 4,
    paddingRight: 8,
  },
  gameGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  selectedBanner: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: tokens.colors.shellRowBorder,
  },
  selectedText: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.colors.textOnBrand,
    textAlign: 'center',
  },
});
