import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Users } from 'lucide-react-native';
import { authService, clubService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { MainBottomNav, mainBottomNavClearance } from '../../ui/components/MainBottomNav.native';
import { LIVE_SCREEN_GUTTER } from '../../ui/components/live/LiveContentWidth.native';
import { LiveContentWidth } from '../../ui/components/live/LiveContentWidth.native';
import {
  LiveTypographyProvider,
  LiveText,
  LiveTextInput,
  LiveRetroButton,
} from '../../ui/components/live/LiveTypography.native';
import { welcomeButtonStyles } from '../../ui/styles/welcomeButtonStyles.native';
import { ClubLobbyHero } from '../../ui/components/clubs/ClubLobbyHero.native';
import { ClubFeatureGrid } from '../../ui/components/clubs/ClubFeatureGrid.native';
import { ClubSafetyNote } from '../../ui/components/clubs/ClubSafetyNote.native';
import { ClubCard } from '../../ui/components/clubs/ClubCard.native';

export function ClubsScreen({ onNavigate }) {
  const meUid = authService.getCurrentUser()?.uid || null;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const [bottomNavH, setBottomNavH] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [publicClubs, setPublicClubs] = useState([]);
  const [myClubIds, setMyClubIds] = useState([]);
  const [privateClubMap, setPrivateClubMap] = useState({});
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinClubId, setJoinClubId] = useState('');

  useEffect(() => {
    if (!meUid) {
      onNavigateRef.current('onboarding', { mode: 'login' });
      return undefined;
    }

    let alive = true;
    setLoading(true);
    setLoadError('');

    const finishLoading = () => {
      if (alive) setLoading(false);
    };
    const safety = setTimeout(finishLoading, 6000);

    const unsubPublic = clubService.listenPublicClubs(({ data, error }) => {
      if (!alive) return;
      if (error) setLoadError(String(error));
      setPublicClubs(Array.isArray(data) ? data : []);
      finishLoading();
    });

    const unsubMine = clubService.listenMyMemberships(meUid, ({ data, error }) => {
      if (!alive) return;
      if (error) console.warn('[Clubs memberships]', error);
      setMyClubIds((Array.isArray(data) ? data : []).map((m) => String(m.clubId)));
    });

    return () => {
      alive = false;
      clearTimeout(safety);
      unsubPublic?.();
      unsubMine?.();
    };
  }, [meUid]);

  // Only listen to private clubs not already in the public list.
  useEffect(() => {
    const publicIds = new Set(publicClubs.map((c) => c.id));
    const privateIds = myClubIds.filter((id) => !publicIds.has(id));
    if (!privateIds.length) return undefined;

    const unsubs = privateIds.map((id) =>
      clubService.listenClub(id, ({ data }) => {
        if (data) setPrivateClubMap((prev) => ({ ...prev, [id]: data }));
      })
    );
    return () => unsubs.forEach((u) => u?.());
  }, [myClubIds, publicClubs]);

  const clubById = (id) =>
    publicClubs.find((c) => c.id === id) || privateClubMap[id] || null;

  const myClubs = myClubIds.map((id) => clubById(id)).filter(Boolean);
  const discover = publicClubs.filter((c) => !myClubIds.includes(c.id));

  const openClub = (clubId) => onNavigateRef.current('clubRoom', { clubId });

  const handleJoinPublic = async (clubId) => {
    const { error } = await clubService.joinClub(meUid, clubId);
    if (error) Alert.alert('Could not join', error);
    else openClub(clubId);
  };

  const handleJoinWithCode = async () => {
    const code = joinCode.trim().toUpperCase();
    const cid = joinClubId.trim();
    if (!code) {
      Alert.alert('Enter code', 'Paste the club invite code.');
      return;
    }
    let targetId = cid;
    if (!targetId) {
      const match =
        publicClubs.find((c) => String(c.inviteCode || '').toUpperCase() === code) ||
        Object.values(privateClubMap).find((c) => String(c.inviteCode || '').toUpperCase() === code);
      targetId = match?.id;
    }
    if (!targetId) {
      Alert.alert('Club not found', 'Enter the club ID from your invite, or browse public clubs.');
      return;
    }
    const { error } = await clubService.joinClub(meUid, targetId, code);
    if (error) Alert.alert('Could not join', error);
    else {
      setJoinOpen(false);
      setJoinCode('');
      setJoinClubId('');
      openClub(targetId);
    }
  };

  const navClearance = mainBottomNavClearance(bottomNavH, 12);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LiveTypographyProvider>
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <LiveText style={styles.title}>Clubs</LiveText>
          <View style={styles.headerActions}>
            <HuzzPressable style={styles.headerBtn} onPress={() => setJoinOpen(true)} haptic="light">
              <LiveText style={styles.headerBtnText}>Code</LiveText>
            </HuzzPressable>
            <HuzzPressable
              style={styles.headerBtnPrimary}
              onPress={() => onNavigateRef.current('createClub')}
              haptic="medium"
            >
              <Plus size={20} color="#fff" strokeWidth={2.5} />
            </HuzzPressable>
          </View>
        </View>

        {loadError ? (
          <LiveContentWidth style={styles.bannerWrap}>
            <View style={styles.banner}>
              <LiveText style={styles.bannerText}>{loadError}</LiveText>
            </View>
          </LiveContentWidth>
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: navClearance }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <ClubLobbyHero />
          <ClubFeatureGrid />

          {loading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="large" color={tokens.colors.accent} />
              <LiveText style={styles.loadingText}>Loading clubs…</LiveText>
            </View>
          ) : (
            <>
              {myClubs.length > 0 ? (
                <LiveContentWidth style={styles.section}>
                  <LiveText style={styles.sectionTitle}>My clubs</LiveText>
                  {myClubs.map((club) => (
                    <ClubCard
                      key={club.id}
                      club={club}
                      joined
                      onPress={() => openClub(club.id)}
                    />
                  ))}
                </LiveContentWidth>
              ) : null}

              <LiveContentWidth style={styles.section}>
                <LiveText style={styles.sectionTitle}>Discover</LiveText>
                {discover.length === 0 ? (
                  <View style={styles.empty}>
                    <View style={styles.emptyIcon}>
                      <Users size={36} color={tokens.colors.textMuted} strokeWidth={1.5} />
                    </View>
                    <LiveText style={styles.emptyTitle}>No public clubs yet</LiveText>
                    <LiveText style={styles.emptyText}>
                      Be the first — create a club and invite friends with a code.
                    </LiveText>
                  </View>
                ) : (
                  discover.map((club) => (
                    <ClubCard
                      key={club.id}
                      club={club}
                      joined={false}
                      onPress={() => handleJoinPublic(club.id)}
                    />
                  ))
                )}
              </LiveContentWidth>
            </>
          )}

          <ClubSafetyNote />

          <LiveContentWidth style={styles.ctaStack}>
            <LiveRetroButton
              variant="primary"
              onPress={() => onNavigateRef.current('createClub')}
              style={[styles.cta, welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.welcomeBtnPrimaryShadow]}
              textStyle={welcomeButtonStyles.welcomeBtnLabel}
            >
              Create a club
            </LiveRetroButton>
            <LiveRetroButton
              variant="outline"
              onPress={() => setJoinOpen(true)}
              style={[styles.cta, welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.outlineOnBlue]}
              textStyle={welcomeButtonStyles.welcomeBtnLabel}
            >
              Join with code
            </LiveRetroButton>
          </LiveContentWidth>
        </ScrollView>

        <Modal visible={joinOpen} transparent animationType="fade" onRequestClose={() => setJoinOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <LiveText style={styles.modalTitle}>Join with code</LiveText>
              <LiveText style={styles.modalHint}>
                Private clubs need the 6-character code from the admin.
              </LiveText>
              <LiveTextInput
                style={styles.modalInput}
                placeholder="Invite code"
                placeholderTextColor={tokens.colors.textMuted}
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.toUpperCase())}
                autoCapitalize="characters"
              />
              <LiveTextInput
                style={styles.modalInput}
                placeholder="Club ID (optional)"
                placeholderTextColor={tokens.colors.textMuted}
                value={joinClubId}
                onChangeText={setJoinClubId}
                autoCapitalize="none"
              />
              <LiveRetroButton
                variant="blue"
                onPress={handleJoinWithCode}
                style={welcomeButtonStyles.welcomeBtnShape}
                textStyle={welcomeButtonStyles.welcomeBtnLabel}
              >
                Join club
              </LiveRetroButton>
              <HuzzPressable onPress={() => setJoinOpen(false)} style={styles.cancelBtn}>
                <LiveText style={styles.cancelText}>Cancel</LiveText>
              </HuzzPressable>
            </View>
          </View>
        </Modal>

        <MainBottomNav active="clubs" onNavigate={onNavigate} onLayout={setBottomNavH} />
      </LiveTypographyProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: LIVE_SCREEN_GUTTER,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  headerSide: { width: 70 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 70,
    justifyContent: 'flex-end',
  },
  headerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  headerBtnText: { ...tokens.typography.label, color: tokens.colors.text },
  headerBtnPrimary: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...tokens.typography.titleSmall, color: tokens.colors.text },
  bannerWrap: { marginTop: 10 },
  banner: {
    backgroundColor: tokens.colors.filterBgRose,
    padding: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderRose,
  },
  bannerText: { ...tokens.typography.bodySmall, color: tokens.colors.danger },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: tokens.spacing.md, flexGrow: 1 },
  loadingBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  loadingText: { ...tokens.typography.bodySmall, color: tokens.colors.textSecondary },
  section: { marginBottom: tokens.spacing.lg },
  sectionTitle: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    marginBottom: 4,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    ...tokens.typography.titleSmall,
    color: tokens.colors.text,
    marginBottom: 6,
  },
  emptyText: {
    ...tokens.typography.bodySmall,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  ctaStack: { gap: 12, marginBottom: tokens.spacing.md },
  cta: { width: '100%' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  modalTitle: { fontSize: 22, color: tokens.colors.text, marginBottom: 6 },
  modalHint: {
    ...tokens.typography.bodySmall,
    color: tokens.colors.textSecondary,
    marginBottom: 14,
    lineHeight: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    fontSize: 16,
    color: tokens.colors.text,
    backgroundColor: tokens.colors.bgSecondary,
  },
  cancelBtn: { marginTop: 14 },
  cancelText: { textAlign: 'center', color: tokens.colors.textMuted, fontWeight: '600' },
});
