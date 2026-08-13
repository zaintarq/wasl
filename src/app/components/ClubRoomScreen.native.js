import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator,
  Share,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Settings, Mic } from 'lucide-react-native';
import { authService, clubService, userService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { LIVE_SCREEN_GUTTER, LiveContentWidth } from '../../ui/components/live/LiveContentWidth.native';
import {
  LiveTypographyProvider,
  LiveText,
  LiveTextInput,
  LiveRetroButton,
} from '../../ui/components/live/LiveTypography.native';
import { welcomeButtonStyles } from '../../ui/styles/welcomeButtonStyles.native';
import { ClubAudioRoom } from '../../ui/components/live/ClubAudioRoom.native';

const MIC_MODES = [
  { key: 'open', label: 'Open mic', hint: 'Everyone in the club can talk.' },
  { key: 'request', label: 'Request mic', hint: 'Members ask admins to speak.' },
  { key: 'admin_only', label: 'Admins only', hint: 'Only owners and admins can use the mic.' },
];

export function ClubRoomScreen({ onNavigate, clubId }) {
  const meUid = authService.getCurrentUser()?.uid || null;
  const cid = String(clubId || '').trim();
  const [club, setClub] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [micRequests, setMicRequests] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [text, setText] = useState('');
  const [inVoice, setInVoice] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [settingsDesc, setSettingsDesc] = useState('');
  const [settingsPublic, setSettingsPublic] = useState(true);
  const [settingsMicMode, setSettingsMicMode] = useState('request');
  const [savingSettings, setSavingSettings] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (!meUid || !cid) return undefined;
    const u1 = clubService.listenClub(cid, ({ data }) => setClub(data));
    const u2 = clubService.listenMembers(cid, ({ data }) => setMembers(data || []));
    const u3 = clubService.listenMessages(cid, ({ data }) => setMessages(data || []));
    const u4 = clubService.listenMicRequests(cid, ({ data }) => setMicRequests(data || []));
    return () => {
      u1?.();
      u2?.();
      u3?.();
      u4?.();
    };
  }, [meUid, cid]);

  useEffect(() => {
    const uids = Array.from(new Set(members.map((m) => m.uid).filter(Boolean)));
    Promise.all(
      uids.map(async (uid) => {
        const res = await userService.getUserById(uid);
        return [uid, res?.data || null];
      })
    ).then((pairs) => setUsersById(Object.fromEntries(pairs)));
  }, [members]);

  const myMember = useMemo(
    () => members.find((m) => String(m.uid) === String(meUid)) || null,
    [members, meUid]
  );
  const isAdmin = myMember && ['owner', 'admin'].includes(String(myMember.role || ''));

  useEffect(() => {
    if (!club) return;
    setSettingsDesc(String(club.description || ''));
    setSettingsPublic(club.isPublic !== false);
    setSettingsMicMode(String(club.micMode || 'request'));
  }, [club?.id, club?.description, club?.isPublic, club?.micMode]);

  const saveClubSettings = async () => {
    if (!meUid || !cid) return;
    setSavingSettings(true);
    try {
      const { error } = await clubService.updateClubSettings(cid, meUid, {
        description: settingsDesc,
        isPublic: settingsPublic,
        micMode: settingsMicMode,
      });
      if (error) Alert.alert('Could not save settings', error);
      else Alert.alert('Saved', 'Club settings updated.');
    } finally {
      setSavingSettings(false);
    }
  };

  const displayName = (uid) => {
    const u = usersById[uid];
    if (u?.username) return `@${u.username}`;
    return u?.name || 'Member';
  };

  const joinClub = async () => {
    const { error } = await clubService.joinClub(meUid, cid, joinCode);
    if (error) Alert.alert('Could not join', error);
  };

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    const { error } = await clubService.sendMessage(cid, meUid, t);
    if (error) Alert.alert('Message failed', error);
  };

  const requestMic = async () => {
    const { error } = await clubService.requestMic(cid, meUid);
    if (error) Alert.alert('Request failed', error);
    else Alert.alert('Requested', 'An admin can approve your mic.');
  };

  const shareInvite = async () => {
    if (!club?.inviteCode) return;
    try {
      await Share.share({
        message: `Join my Huzz club "${club.name}"!\nCode: ${club.inviteCode}\nClub ID: ${cid}`,
      });
    } catch {
      /* user dismissed */
    }
  };

  if (!cid) {
    return (
      <SafeAreaView style={styles.safe}>
        <LiveTypographyProvider>
          <LiveText style={styles.err}>Missing club.</LiveText>
          <LiveContentWidth style={{ paddingVertical: LIVE_SCREEN_GUTTER }}>
            <LiveRetroButton
              variant="blue"
              onPress={() => onNavigate('clubs')}
              style={[welcomeButtonStyles.welcomeBtnShape]}
              textStyle={welcomeButtonStyles.welcomeBtnLabel}
            >
              Back to clubs
            </LiveRetroButton>
          </LiveContentWidth>
        </LiveTypographyProvider>
      </SafeAreaView>
    );
  }

  if (!club) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator size="large" color={tokens.colors.accent} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!myMember) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <LiveTypographyProvider>
          <View style={styles.header}>
            <HuzzPressable onPress={() => onNavigate('clubs')} style={styles.iconBtn} haptic="light">
              <ArrowLeft size={22} color={tokens.colors.text} strokeWidth={2.2} />
            </HuzzPressable>
            <LiveText style={styles.headerTitle} numberOfLines={1}>
              {club.name}
            </LiveText>
            <View style={styles.headerSide} />
          </View>
          <LiveContentWidth style={styles.joinGate}>
            <LiveText style={styles.joinTitle}>{club.isPublic ? 'Join this club' : 'Private club'}</LiveText>
            <LiveText style={styles.joinHint}>
              {club.isPublic
                ? club.description || 'Public space — join to chat and use voice.'
                : 'Enter the invite code from the admin.'}
            </LiveText>
            {!club.isPublic ? (
              <LiveTextInput
                style={styles.codeInput}
                placeholder="Invite code"
                placeholderTextColor={tokens.colors.textMuted}
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.toUpperCase())}
                autoCapitalize="characters"
              />
            ) : null}
            <LiveRetroButton
              variant="blue"
              onPress={joinClub}
              style={[welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.welcomeBtnPrimaryShadow]}
              textStyle={welcomeButtonStyles.welcomeBtnLabel}
            >
              Join club
            </LiveRetroButton>
          </LiveContentWidth>
        </LiveTypographyProvider>
      </SafeAreaView>
    );
  }

  const micMode = String(club.micMode || 'request');
  const canSpeak =
    isAdmin || micMode === 'open' || (micMode === 'request' && myMember.canSpeak === true);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LiveTypographyProvider>
      <View style={styles.header}>
        <HuzzPressable onPress={() => onNavigate('clubs')} style={styles.iconBtn} haptic="light">
          <ArrowLeft size={22} color={tokens.colors.text} strokeWidth={2.2} />
        </HuzzPressable>
        <View style={styles.headerCenter}>
          <LiveText style={styles.headerTitle} numberOfLines={1}>
            {club.name}
          </LiveText>
          <LiveText style={styles.headerSub}>
            {members.length} member{members.length === 1 ? '' : 's'} · {club.isPublic ? 'Public' : 'Private'}
          </LiveText>
        </View>
        {isAdmin ? (
          <HuzzPressable onPress={() => setAdminOpen(true)} style={styles.iconBtn} haptic="light">
            <Settings size={22} color={tokens.colors.text} strokeWidth={2.2} />
          </HuzzPressable>
        ) : (
          <View style={styles.headerSide} />
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberStrip} contentContainerStyle={styles.memberStripContent}>
        {members.map((m) => (
          <View key={m.uid} style={styles.memberChip}>
            <LiveText style={styles.memberChipText} numberOfLines={1}>
              {displayName(m.uid)}
            </LiveText>
            {m.role !== 'member' ? (
              <LiveText style={styles.memberRole}>{m.role === 'owner' ? 'Owner' : 'Admin'}</LiveText>
            ) : m.canSpeak ? (
              <Mic size={12} color={tokens.colors.success} />
            ) : null}
          </View>
        ))}
      </ScrollView>

      {inVoice ? (
        <View style={styles.voiceWrap}>
          <ClubAudioRoom clubId={cid} canPublishHint={canSpeak} onLeave={() => setInVoice(false)} />
        </View>
      ) : (
        <View style={styles.voiceBar}>
          <LiveRetroButton
            variant="blue"
            onPress={() => setInVoice(true)}
            style={[styles.voiceBtn, welcomeButtonStyles.welcomeBtnShape]}
            textStyle={welcomeButtonStyles.welcomeBtnLabel}
          >
            Join voice space
          </LiveRetroButton>
          {micMode === 'request' && !canSpeak && !isAdmin ? (
            <HuzzPressable onPress={requestMic} style={styles.requestMicBtn} haptic="light">
              <LiveText style={styles.requestMicText}>Request mic</LiveText>
            </HuzzPressable>
          ) : null}
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => {
          const mine = String(item.fromUid) === String(meUid);
          return (
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
              {!mine ? <LiveText style={styles.bubbleAuthor}>{displayName(item.fromUid)}</LiveText> : null}
              <LiveText style={styles.bubbleText}>{item.text}</LiveText>
            </View>
          );
        }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.composer}>
        <LiveTextInput
          style={styles.composerInput}
          placeholder="Message the club…"
          placeholderTextColor={tokens.colors.textMuted}
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
        />
        <HuzzPressable style={styles.sendBtn} onPress={send} haptic="medium">
          <LiveText style={styles.sendBtnText}>Send</LiveText>
        </HuzzPressable>
      </View>

      <Modal visible={adminOpen} animationType="slide" onRequestClose={() => setAdminOpen(false)}>
        <SafeAreaView style={styles.adminModal} edges={['top', 'bottom']}>
          <View style={styles.adminHeader}>
            <HuzzPressable onPress={() => setAdminOpen(false)} style={styles.iconBtn} haptic="light">
              <ArrowLeft size={22} color={tokens.colors.text} strokeWidth={2.2} />
            </HuzzPressable>
            <LiveText style={styles.adminTitle}>Club admin</LiveText>
            <View style={styles.headerSide} />
          </View>
          <ScrollView contentContainerStyle={styles.adminScroll} showsVerticalScrollIndicator={false}>
            <LiveContentWidth>
            <LiveText style={styles.adminSection}>Club settings</LiveText>
            <LiveText style={styles.settingsLabel}>Description</LiveText>
            <LiveTextInput
              style={styles.codeInput}
              placeholder="What is this club about?"
              placeholderTextColor={tokens.colors.textMuted}
              value={settingsDesc}
              onChangeText={setSettingsDesc}
              multiline
            />
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <LiveText style={styles.switchLabel}>Public club</LiveText>
                <LiveText style={styles.switchHint}>
                  {settingsPublic ? 'Anyone can discover and join.' : 'Invite code required to join.'}
                </LiveText>
              </View>
              <Switch value={settingsPublic} onValueChange={setSettingsPublic} trackColor={{ true: tokens.colors.blue }} />
            </View>
            <LiveText style={[styles.settingsLabel, { marginTop: 12 }]}>Voice rules</LiveText>
            {MIC_MODES.map((m) => (
              <HuzzPressable
                key={m.key}
                style={[styles.modeChip, settingsMicMode === m.key && styles.modeChipOn]}
                onPress={() => setSettingsMicMode(m.key)}
                haptic="light"
              >
                <LiveText style={[styles.modeLabel, settingsMicMode === m.key && styles.modeLabelOn]}>{m.label}</LiveText>
                <LiveText style={styles.modeHint}>{m.hint}</LiveText>
              </HuzzPressable>
            ))}
            <LiveRetroButton
              variant="blue"
              onPress={saveClubSettings}
              disabled={savingSettings}
              style={[styles.adminBtn, welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.welcomeBtnPrimaryShadow]}
              textStyle={welcomeButtonStyles.welcomeBtnLabel}
            >
              {savingSettings ? 'Saving…' : 'Save settings'}
            </LiveRetroButton>

            <LiveRetroButton
              variant="outline"
              onPress={shareInvite}
              style={[styles.adminBtn, welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.outlineOnBlue]}
              textStyle={welcomeButtonStyles.welcomeBtnLabel}
            >
              Share invite code
            </LiveRetroButton>
            <LiveText style={styles.adminSection}>Invite code: {club.inviteCode}</LiveText>

            <LiveText style={styles.adminSection}>Add member by username</LiveText>
            <LiveTextInput
              style={styles.codeInput}
              placeholder="@username"
              placeholderTextColor={tokens.colors.textMuted}
              value={addUsername}
              onChangeText={setAddUsername}
              autoCapitalize="none"
            />
            <LiveRetroButton
              variant="blue"
              onPress={async () => {
                const { error } = await clubService.addMemberByUsername(cid, addUsername);
                if (error) Alert.alert('Could not add', error);
                else {
                  setAddUsername('');
                  Alert.alert('Added', 'User was added to the club.');
                }
              }}
              style={[styles.adminBtn, welcomeButtonStyles.welcomeBtnShape]}
              textStyle={welcomeButtonStyles.welcomeBtnLabel}
            >
              Add to club
            </LiveRetroButton>

            {micRequests.length > 0 ? (
              <>
                <LiveText style={styles.adminSection}>Mic requests</LiveText>
                {micRequests.map((r) => (
                  <View key={r.uid} style={styles.adminRow}>
                    <LiveText style={styles.adminRowName}>{displayName(r.uid)}</LiveText>
                    <HuzzPressable
                      onPress={async () => {
                        await clubService.grantMic(cid, r.uid);
                      }}
                      style={styles.adminAction}
                    >
                      <LiveText style={styles.adminActionText}>Allow mic</LiveText>
                    </HuzzPressable>
                  </View>
                ))}
              </>
            ) : null}

            <LiveText style={styles.adminSection}>Members</LiveText>
            {members.map((m) => (
              <View key={m.uid} style={styles.adminRow}>
                <View style={{ flex: 1 }}>
                  <LiveText style={styles.adminMemberName}>{displayName(m.uid)}</LiveText>
                  <LiveText style={styles.adminMemberRole}>{m.role}</LiveText>
                </View>
                {m.uid !== meUid && m.role !== 'owner' ? (
                  <View style={styles.adminActions}>
                    {m.role === 'member' ? (
                      <HuzzPressable
                        onPress={() => clubService.setMemberRole(cid, m.uid, 'admin')}
                        style={styles.adminAction}
                      >
                        <LiveText style={styles.adminActionText}>Make admin</LiveText>
                      </HuzzPressable>
                    ) : (
                      <HuzzPressable
                        onPress={() => clubService.setMemberRole(cid, m.uid, 'member')}
                        style={styles.adminAction}
                      >
                        <LiveText style={styles.adminActionText}>Demote</LiveText>
                      </HuzzPressable>
                    )}
                    {m.canSpeak ? (
                      <HuzzPressable onPress={() => clubService.revokeMic(cid, m.uid)} style={styles.adminAction}>
                        <LiveText style={styles.adminActionText}>Revoke mic</LiveText>
                      </HuzzPressable>
                    ) : (
                      <HuzzPressable onPress={() => clubService.grantMic(cid, m.uid)} style={styles.adminAction}>
                        <LiveText style={styles.adminActionText}>Grant mic</LiveText>
                      </HuzzPressable>
                    )}
                    <HuzzPressable
                      onPress={() =>
                        Alert.alert('Remove member?', displayName(m.uid), [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove',
                            style: 'destructive',
                            onPress: () => clubService.kickMember(cid, m.uid),
                          },
                        ])
                      }
                      style={[styles.adminAction, styles.adminActionDanger]}
                    >
                      <LiveText style={[styles.adminActionText, styles.adminActionTextDanger]}>Kick</LiveText>
                    </HuzzPressable>
                  </View>
                ) : null}
              </View>
            ))}
            </LiveContentWidth>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      </LiveTypographyProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  err: { textAlign: 'center', margin: 24, color: tokens.colors.textSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: LIVE_SCREEN_GUTTER,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerSide: { width: 44 },
  headerCenter: { flex: 1, alignItems: 'center', minWidth: 0 },
  headerTitle: { ...tokens.typography.titleSmall, color: tokens.colors.text },
  headerSub: { ...tokens.typography.caption, color: tokens.colors.textMuted, marginTop: 2 },
  memberStrip: { maxHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.colors.border },
  memberStripContent: { paddingHorizontal: LIVE_SCREEN_GUTTER, gap: 8 },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: tokens.colors.filterBgSky,
    maxWidth: 140,
  },
  memberChipText: { ...tokens.typography.label, fontSize: 13, color: tokens.colors.text },
  memberRole: { fontSize: 10, fontWeight: '800', color: tokens.colors.blue },
  voiceWrap: { paddingHorizontal: LIVE_SCREEN_GUTTER, marginBottom: 8 },
  voiceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: LIVE_SCREEN_GUTTER,
    paddingVertical: 10,
  },
  voiceBtn: { flexShrink: 0 },
  requestMicBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  requestMicText: { fontWeight: '700', color: tokens.colors.blue },
  messageList: { padding: LIVE_SCREEN_GUTTER, paddingBottom: 8 },
  bubble: {
    maxWidth: '82%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: tokens.colors.filterBgSky,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleAuthor: { fontSize: 11, fontWeight: '800', color: tokens.colors.blue, marginBottom: 4 },
  bubbleText: { fontSize: 15, color: tokens.colors.text, lineHeight: 21 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    paddingHorizontal: LIVE_SCREEN_GUTTER,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: tokens.colors.text,
    backgroundColor: tokens.colors.bgSecondary,
  },
  sendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.blue,
  },
  sendBtnText: { color: '#fff', fontWeight: '800' },
  joinGate: { flex: 1, paddingVertical: LIVE_SCREEN_GUTTER, justifyContent: 'center', gap: 12 },
  joinTitle: { fontSize: 22, color: tokens.colors.text },
  joinHint: { ...tokens.typography.bodySmall, color: tokens.colors.textSecondary, lineHeight: 22 },
  codeInput: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: tokens.colors.text,
    backgroundColor: tokens.colors.bgSecondary,
    marginBottom: 8,
  },
  adminModal: { flex: 1, backgroundColor: tokens.colors.bg },
  adminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: LIVE_SCREEN_GUTTER,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  adminTitle: { ...tokens.typography.titleSmall, color: tokens.colors.text },
  adminScroll: { paddingVertical: 16, paddingBottom: 32 },
  adminSection: {
    ...tokens.typography.caption,
    fontWeight: '800',
    color: tokens.colors.textSecondary,
    marginTop: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  adminBtn: { width: '100%', marginBottom: 8 },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
  },
  adminRowName: { flex: 1, color: tokens.colors.text },
  adminMemberName: { fontWeight: '700', color: tokens.colors.text },
  adminMemberRole: { fontSize: 12, color: tokens.colors.textMuted },
  adminActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: '55%', justifyContent: 'flex-end' },
  adminAction: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: tokens.colors.filterBgSky },
  adminActionDanger: { backgroundColor: tokens.colors.filterBgRose },
  adminActionText: { fontSize: 11, fontWeight: '800', color: tokens.colors.blue },
  adminActionTextDanger: { color: tokens.colors.danger },
  settingsLabel: { fontSize: 13, fontWeight: '700', color: tokens.colors.text, marginBottom: 6 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    marginBottom: 8,
    padding: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  switchLabel: { fontWeight: '700', color: tokens.colors.text },
  switchHint: { fontSize: 13, color: tokens.colors.textMuted, marginTop: 4 },
  modeChip: {
    padding: 14,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    marginBottom: 8,
  },
  modeChipOn: {
    borderColor: tokens.colors.blue,
    backgroundColor: tokens.colors.filterBgSky,
  },
  modeLabel: { fontWeight: '700', color: tokens.colors.text },
  modeLabelOn: { color: tokens.colors.blue },
  modeHint: { fontSize: 13, color: tokens.colors.textMuted, marginTop: 4 },
});
