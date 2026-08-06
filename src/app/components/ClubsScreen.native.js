import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Lock, Globe, Users } from 'lucide-react-native';
import { authService, clubService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { MainBottomNav } from '../../ui/components/MainBottomNav.native';

export function ClubsScreen({ onNavigate }) {
  const meUid = authService.getCurrentUser()?.uid || null;
  const [loading, setLoading] = useState(true);
  const [publicClubs, setPublicClubs] = useState([]);
  const [myClubIds, setMyClubIds] = useState([]);
  const [clubMap, setClubMap] = useState({});
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinClubId, setJoinClubId] = useState('');

  useEffect(() => {
    if (!meUid) {
      onNavigate('onboarding', { mode: 'login' });
      return undefined;
    }
    setLoading(true);
    const unsubPublic = clubService.listenPublicClubs(({ data, error }) => {
      if (error) console.warn('[Clubs]', error);
      setPublicClubs(Array.isArray(data) ? data : []);
      setLoading(false);
    });
    const unsubMine = clubService.listenMyMemberships(meUid, ({ data }) => {
      setMyClubIds((Array.isArray(data) ? data : []).map((m) => String(m.clubId)));
    });
    return () => {
      unsubPublic?.();
      unsubMine?.();
    };
  }, [meUid, onNavigate]);

  useEffect(() => {
    const ids = Array.from(new Set([...myClubIds, ...publicClubs.map((c) => c.id)]));
    const unsubs = ids.map((id) =>
      clubService.listenClub(id, ({ data }) => {
        if (data) setClubMap((prev) => ({ ...prev, [id]: data }));
      })
    );
    return () => unsubs.forEach((u) => u?.());
  }, [myClubIds, publicClubs]);

  const myClubs = myClubIds.map((id) => clubMap[id]).filter(Boolean);
  const discover = publicClubs.filter((c) => !myClubIds.includes(c.id));

  const openClub = (clubId) => onNavigate('clubRoom', { clubId });

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
        Object.values(clubMap).find((c) => String(c.inviteCode || '').toUpperCase() === code);
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

  const renderClubRow = (club, joined) => (
    <HuzzPressable
      key={club.id}
      style={styles.clubRow}
      onPress={() => (joined ? openClub(club.id) : handleJoinPublic(club.id))}
      haptic="light"
    >
      <View style={styles.clubIcon}>
        {club.isPublic ? (
          <Globe size={20} color={tokens.colors.blue} strokeWidth={2} />
        ) : (
          <Lock size={20} color={tokens.colors.warning} strokeWidth={2} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.clubName}>{club.name}</Text>
        <Text style={styles.clubMeta} numberOfLines={1}>
          {club.description || (club.isPublic ? 'Public club' : 'Private — invite code required')}
        </Text>
      </View>
      <Text style={styles.clubAction}>{joined ? 'Open →' : 'Join'}</Text>
    </HuzzPressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Clubs</Text>
        <View style={styles.headerActions}>
          <HuzzPressable style={styles.headerBtn} onPress={() => setJoinOpen(true)} haptic="light">
            <Text style={styles.headerBtnText}>Code</Text>
          </HuzzPressable>
          <HuzzPressable style={styles.headerBtnPrimary} onPress={() => onNavigate('createClub')} haptic="medium">
            <Plus size={20} color="#fff" strokeWidth={2.5} />
          </HuzzPressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={tokens.colors.accent} />
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {myClubs.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>My clubs</Text>
              {myClubs.map((c) => renderClubRow(c, true))}
            </>
          ) : null}

          <Text style={[styles.sectionTitle, { marginTop: myClubs.length ? 20 : 0 }]}>Discover</Text>
          {discover.length === 0 ? (
            <View style={styles.empty}>
              <Users size={40} color={tokens.colors.textMuted} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No public clubs yet</Text>
              <Text style={styles.emptyText}>Create one and invite people with a code.</Text>
              <RetroButton variant="blue" title="Create club" onPress={() => onNavigate('createClub')} />
            </View>
          ) : (
            discover.map((c) => renderClubRow(c, false))
          )}
        </ScrollView>
      )}

      <Modal visible={joinOpen} transparent animationType="fade" onRequestClose={() => setJoinOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Join with code</Text>
            <Text style={styles.modalHint}>Private clubs need the 6-character code from the admin.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Invite code"
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Club ID (optional)"
              value={joinClubId}
              onChangeText={setJoinClubId}
              autoCapitalize="none"
            />
            <RetroButton variant="blue" title="Join club" onPress={handleJoinWithCode} />
            <HuzzPressable onPress={() => setJoinOpen(false)} style={{ marginTop: 12 }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </HuzzPressable>
          </View>
        </View>
      </Modal>

      <MainBottomNav active="clubs" onNavigate={onNavigate} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
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
  title: { ...tokens.typography.title, color: tokens.colors.text },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  headerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.bgSecondary,
  },
  headerBtnText: { fontWeight: '700', color: tokens.colors.text },
  headerBtnPrimary: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 8,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    marginBottom: 10,
  },
  clubIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: tokens.colors.filterBgSky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubName: { fontSize: 16, fontWeight: '700', color: tokens.colors.text },
  clubMeta: { fontSize: 13, color: tokens.colors.textMuted, marginTop: 2 },
  clubAction: { fontWeight: '700', color: tokens.colors.blue },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: tokens.colors.text },
  emptyText: { textAlign: 'center', color: tokens.colors.textSecondary, marginBottom: 8, paddingHorizontal: 20 },
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
  modalTitle: { fontSize: 20, fontWeight: '700', color: tokens.colors.text, marginBottom: 6 },
  modalHint: { fontSize: 14, color: tokens.colors.textSecondary, marginBottom: 14 },
  modalInput: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    fontSize: 16,
    backgroundColor: tokens.colors.bgSecondary,
  },
  cancelText: { textAlign: 'center', color: tokens.colors.textMuted, fontWeight: '600' },
});
