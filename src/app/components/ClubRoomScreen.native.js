import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Settings, Mic } from 'lucide-react-native';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { authService, clubService, userService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { RetroButton } from '../../ui/components/RetroButton.native';

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
  const [ClubAudioRoom, setClubAudioRoom] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
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
    if (!inVoice) return;
    try {
      const mod = require('../../ui/components/live/ClubAudioRoom.native');
      setClubAudioRoom(() => mod.ClubAudioRoom);
    } catch (e) {
      console.warn('[ClubRoom] voice module', e?.message || e);
    }
  }, [inVoice]);

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
        <Text style={styles.err}>Missing club.</Text>
        <RetroButton variant="blue" title="Back to clubs" onPress={() => onNavigate('clubs')} />
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
        <View style={styles.header}>
          <HuzzPressable onPress={() => onNavigate('clubs')} style={styles.iconBtn} haptic="light">
            <ArrowLeft size={22} color={tokens.colors.text} />
          </HuzzPressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {club.name}
          </Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.joinGate}>
          <Text style={styles.joinTitle}>{club.isPublic ? 'Join this club' : 'Private club'}</Text>
          <Text style={styles.joinHint}>
            {club.isPublic
              ? club.description || 'Public space — join to chat and use voice.'
              : 'Enter the invite code from the admin.'}
          </Text>
          {!club.isPublic ? (
            <TextInput
              style={styles.codeInput}
              placeholder="Invite code"
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              autoCapitalize="characters"
            />
          ) : null}
          <RetroButton variant="blue" title="Join club" onPress={joinClub} />
        </View>
      </SafeAreaView>
    );
  }

  const micMode = String(club.micMode || 'request');
  const canSpeak =
    isAdmin || micMode === 'open' || (micMode === 'request' && myMember.canSpeak === true);

  const joinVoice = async () => {
    if (canSpeak) {
      const mic = await requestRecordingPermissionsAsync();
      if (!mic.granted) {
        Alert.alert(
          'Microphone required',
          'Allow microphone access to speak in the club voice space. You can still read text chat without it.'
        );
        return;
      }
    }
    setInVoice(true);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <HuzzPressable onPress={() => onNavigate('clubs')} style={styles.iconBtn} haptic="light">
          <ArrowLeft size={22} color={tokens.colors.text} />
        </HuzzPressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {club.name}
          </Text>
          <Text style={styles.headerSub}>
            {members.length} member{members.length === 1 ? '' : 's'} · {club.isPublic ? 'Public' : 'Private'}
          </Text>
        </View>
        {isAdmin ? (
          <HuzzPressable onPress={() => setAdminOpen(true)} style={styles.iconBtn} haptic="light">
            <Settings size={22} color={tokens.colors.text} />
          </HuzzPressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberStrip} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
        {members.map((m) => (
          <View key={m.uid} style={styles.memberChip}>
            <Text style={styles.memberChipText} numberOfLines={1}>
              {displayName(m.uid)}
            </Text>
            {m.role !== 'member' ? (
              <Text style={styles.memberRole}>{m.role === 'owner' ? 'Owner' : 'Admin'}</Text>
            ) : m.canSpeak ? (
              <Mic size={12} color={tokens.colors.success} />
            ) : null}
          </View>
        ))}
      </ScrollView>

      {inVoice ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          {ClubAudioRoom ? (
            <ClubAudioRoom
              clubId={cid}
              canPublishHint={canSpeak}
              onLeave={() => setInVoice(false)}
            />
          ) : (
            <ActivityIndicator color={tokens.colors.accent} style={{ marginVertical: 12 }} />
          )}
        </View>
      ) : (
        <View style={styles.voiceBar}>
          <RetroButton variant="blue" title="Join voice space" onPress={joinVoice} />
          {micMode === 'request' && !canSpeak && !isAdmin ? (
            <HuzzPressable onPress={requestMic} style={styles.requestMicBtn} haptic="light">
              <Text style={styles.requestMicText}>Request mic</Text>
            </HuzzPressable>
          ) : null}
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        renderItem={({ item }) => {
          const mine = String(item.fromUid) === String(meUid);
          return (
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
              {!mine ? <Text style={styles.bubbleAuthor}>{displayName(item.fromUid)}</Text> : null}
              <Text style={styles.bubbleText}>{item.text}</Text>
            </View>
          );
        }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          placeholder="Message the club…"
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
        />
        <HuzzPressable style={styles.sendBtn} onPress={send} haptic="medium">
          <Text style={styles.sendBtnText}>Send</Text>
        </HuzzPressable>
      </View>

      <Modal visible={adminOpen} animationType="slide" onRequestClose={() => setAdminOpen(false)}>
        <SafeAreaView style={styles.adminModal}>
          <View style={styles.adminHeader}>
            <Text style={styles.adminTitle}>Club admin</Text>
            <HuzzPressable onPress={() => setAdminOpen(false)}>
              <Text style={styles.adminClose}>Done</Text>
            </HuzzPressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <RetroButton variant="outline" title="Share invite code" onPress={shareInvite} />
            <Text style={styles.adminSection}>Invite code: {club.inviteCode}</Text>

            <Text style={styles.adminSection}>Add member by username</Text>
            <TextInput
              style={styles.codeInput}
              placeholder="@username"
              value={addUsername}
              onChangeText={setAddUsername}
              autoCapitalize="none"
            />
            <RetroButton
              variant="blue"
              title="Add to club"
              onPress={async () => {
                const { error } = await clubService.addMemberByUsername(cid, addUsername);
                if (error) Alert.alert('Could not add', error);
                else {
                  setAddUsername('');
                  Alert.alert('Added', 'User was added to the club.');
                }
              }}
            />

            {micRequests.length > 0 ? (
              <>
                <Text style={styles.adminSection}>Mic requests</Text>
                {micRequests.map((r) => (
                  <View key={r.uid} style={styles.adminRow}>
                    <Text style={{ flex: 1 }}>{displayName(r.uid)}</Text>
                    <HuzzPressable
                      onPress={async () => {
                        await clubService.grantMic(cid, r.uid);
                      }}
                      style={styles.adminAction}
                    >
                      <Text style={styles.adminActionText}>Allow mic</Text>
                    </HuzzPressable>
                  </View>
                ))}
              </>
            ) : null}

            <Text style={styles.adminSection}>Members</Text>
            {members.map((m) => (
              <View key={m.uid} style={styles.adminRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.adminMemberName}>{displayName(m.uid)}</Text>
                  <Text style={styles.adminMemberRole}>{m.role}</Text>
                </View>
                {m.uid !== meUid && m.role !== 'owner' ? (
                  <View style={styles.adminActions}>
                    {m.role === 'member' ? (
                      <HuzzPressable
                        onPress={() => clubService.setMemberRole(cid, m.uid, 'admin')}
                        style={styles.adminAction}
                      >
                        <Text style={styles.adminActionText}>Make admin</Text>
                      </HuzzPressable>
                    ) : (
                      <HuzzPressable
                        onPress={() => clubService.setMemberRole(cid, m.uid, 'member')}
                        style={styles.adminAction}
                      >
                        <Text style={styles.adminActionText}>Demote</Text>
                      </HuzzPressable>
                    )}
                    {m.canSpeak ? (
                      <HuzzPressable onPress={() => clubService.revokeMic(cid, m.uid)} style={styles.adminAction}>
                        <Text style={styles.adminActionText}>Revoke mic</Text>
                      </HuzzPressable>
                    ) : (
                      <HuzzPressable onPress={() => clubService.grantMic(cid, m.uid)} style={styles.adminAction}>
                        <Text style={styles.adminActionText}>Grant mic</Text>
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
                      <Text style={[styles.adminActionText, { color: tokens.colors.danger }]}>Kick</Text>
                    </HuzzPressable>
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  err: { textAlign: 'center', margin: 24, color: tokens.colors.textSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: tokens.colors.text },
  headerSub: { fontSize: 12, color: tokens.colors.textMuted, marginTop: 2 },
  memberStrip: { maxHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.colors.border },
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
  memberChipText: { fontSize: 13, fontWeight: '700', color: tokens.colors.text },
  memberRole: { fontSize: 10, fontWeight: '800', color: tokens.colors.blue },
  voiceBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  requestMicBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  requestMicText: { fontWeight: '700', color: tokens.colors.blue },
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
    backgroundColor: tokens.colors.bgSecondary,
  },
  sendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.blue,
  },
  sendBtnText: { color: '#fff', fontWeight: '800' },
  joinGate: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  joinTitle: { fontSize: 22, fontWeight: '800', color: tokens.colors.text },
  joinHint: { fontSize: 15, color: tokens.colors.textSecondary, lineHeight: 22 },
  codeInput: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: tokens.colors.bgSecondary,
    marginBottom: 8,
  },
  adminModal: { flex: 1, backgroundColor: tokens.colors.bg },
  adminHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  adminTitle: { fontSize: 18, fontWeight: '800' },
  adminClose: { fontWeight: '700', color: tokens.colors.blue },
  adminSection: { fontSize: 13, fontWeight: '800', color: tokens.colors.textSecondary, marginTop: 20, marginBottom: 8, textTransform: 'uppercase' },
  adminRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.colors.border },
  adminMemberName: { fontWeight: '700', color: tokens.colors.text },
  adminMemberRole: { fontSize: 12, color: tokens.colors.textMuted },
  adminActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: '55%', justifyContent: 'flex-end' },
  adminAction: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: tokens.colors.filterBgSky },
  adminActionDanger: { backgroundColor: tokens.colors.filterBgRose },
  adminActionText: { fontSize: 11, fontWeight: '800', color: tokens.colors.blue },
});
