import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mehramService } from '../../services/mehramService';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';

function formatTime(ts) {
  if (!ts) return '';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function MessageBubble({ item, girlUid, guyUid, girlDisplayName }) {
  const isMehram = String(item?.senderType || '') === 'mehram';
  const isGirl = !isMehram && String(item.fromUid) === String(girlUid);
  const isGuy = !isMehram && String(item.fromUid) === String(guyUid);

  let bubbleStyle = styles.bubbleTheirs;
  if (isMehram) bubbleStyle = styles.bubbleMehram;
  else if (isGirl) bubbleStyle = styles.bubbleGirl;
  else if (isGuy) bubbleStyle = styles.bubbleGuy;

  const body =
    item.type === 'voice'
      ? '🎙️ Voice note'
      : item.deletedAt
        ? 'Message deleted'
        : String(item.text || '');

  return (
    <View style={[styles.msgWrap, isGirl ? styles.msgWrapMine : null]}>
      {isMehram ? (
        <Text style={styles.mehramLabel}>👤 {girlDisplayName}'s Mehram</Text>
      ) : null}
      <View style={[styles.bubble, bubbleStyle]}>
        <Text style={[styles.bubbleText, isGirl ? styles.bubbleTextMine : null]}>{body}</Text>
        <Text style={[styles.time, isGirl ? styles.timeMine : null]}>{formatTime(item.createdAt)}</Text>
      </View>
    </View>
  );
}

export function MehramAccessScreen({ session: sessionProp, onExit, onNavigate }) {
  const [session, setSession] = useState(sessionProp || null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(!sessionProp);
  const [error, setError] = useState('');
  const [permission, setPermission] = useState(sessionProp?.permission || 'view');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [visits, setVisits] = useState([]);
  const [localHistory, setLocalHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [accessDoc, setAccessDoc] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (sessionProp) {
        setSession(sessionProp);
        setPermission(sessionProp.permission === 'reply' ? 'reply' : 'view');
        setLoading(false);
        return;
      }
      const saved = await mehramService.loadSession();
      if (cancelled) return;
      if (!saved?.matchId) {
        setError('No active Mehram session. Open the invitation link again.');
        setLoading(false);
        return;
      }
      setSession(saved);
      setPermission(saved.permission === 'reply' ? 'reply' : 'view');
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionProp]);

  useEffect(() => {
    if (!session?.matchId) return undefined;
    const unsub = mehramService.listenMessages(session.matchId, ({ data, error: err }) => {
      if (err) {
        setError('Mehram access has ended.');
        return;
      }
      setMessages(Array.isArray(data) ? data : []);
    });
    return unsub;
  }, [session?.matchId]);

  useEffect(() => {
    if (!session?.accessId) return undefined;
    const unsub = mehramService.listenMehramAccess(session.accessId, ({ data }) => {
      if (!data || data.status !== 'active') {
        setError('Mehram access has ended.');
        return;
      }
      setAccessDoc(data);
      setPermission(data.permission === 'reply' ? 'reply' : 'view');
    });
    return unsub;
  }, [session?.accessId]);

  useEffect(() => {
    if (!session?.accessId) return undefined;
    mehramService.heartbeat().catch(() => {});
    const id = setInterval(() => {
      mehramService.heartbeat().catch(() => {});
    }, 60000);
    return () => clearInterval(id);
  }, [session?.accessId]);

  useEffect(() => {
    if (!session?.accessId) return undefined;
    let cancelled = false;
    (async () => {
      const [{ data }, local] = await Promise.all([
        mehramService.listSessionHistory({ limit: 20 }),
        mehramService.loadLocalHistory(),
      ]);
      if (cancelled) return;
      setVisits(Array.isArray(data) ? data : []);
      setLocalHistory(Array.isArray(local) ? local.slice(0, 12) : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.accessId]);

  const canReply = permission === 'reply';
  const activeVideoSessionId = String(accessDoc?.activeVideoSessionId || '').trim() || null;

  const headerLine = useMemo(() => {
    if (!session) return '';
    return `${session.girlDisplayName} ↔ ${session.guyDisplayName}`;
  }, [session]);

  const handleSend = useCallback(async () => {
    if (!canReply || !session?.matchId) return;
    const text = String(draft || '').trim();
    if (!text) return;
    setSending(true);
    const { error: err } = await mehramService.sendMehramMessage(
      session.matchId,
      session.accessId,
      session.girlUserId,
      text
    );
    setSending(false);
    if (err) {
      Alert.alert('Could not send', err);
      return;
    }
    setDraft('');
  }, [canReply, draft, session]);

  const handleLeave = useCallback(() => {
    Alert.alert('Leave supervision?', 'You can reopen the invitation link later if access is still active.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          if (session) {
            await mehramService.appendLocalHistory({
              accessId: session.accessId,
              matchId: session.matchId,
              girlDisplayName: session.girlDisplayName,
              guyDisplayName: session.guyDisplayName,
              permission: session.permission,
              event: 'left',
            });
          }
          await mehramService.signOutMehram();
          onExit?.();
        },
      },
    ]);
  }, [onExit, session]);

  const handleReport = useCallback(() => {
    Alert.alert(
      'Report this user?',
      'This sends a report to Huzz moderators. Supervision stays active unless you block or leave.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await mehramService.reportGuy({
              reason: 'inappropriate',
              details: 'Reported by Mehram supervisor.',
            });
            if (err) {
              Alert.alert('Could not report', err);
              return;
            }
            Alert.alert('Report sent', 'Our team will review this conversation.');
          },
        },
      ]
    );
  }, []);

  const handleBlock = useCallback(() => {
    Alert.alert(
      'Block this user?',
      'This will block him on her behalf and end Mehram supervision.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await mehramService.blockGuy();
            if (err) {
              Alert.alert('Could not block', err);
              return;
            }
            await mehramService.signOutMehram();
            Alert.alert('Blocked', 'The user was blocked and supervision ended.');
            onExit?.();
          },
        },
      ]
    );
  }, [onExit]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={tokens.colors.brandPink} />
          <Text style={styles.loadingText}>Opening supervision…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !session) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Mehram access has ended</Text>
          <Text style={styles.errorBody}>
            {error || 'The person who invited you removed access or the link expired.'}
          </Text>
          <HuzzPressable style={styles.outlineBtn} onPress={async () => {
            await mehramService.signOutMehram();
            onExit?.();
          }} haptic="light">
            <Text style={styles.outlineBtnText}>Close</Text>
          </HuzzPressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.header}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🛡️ Mehram Supervision</Text>
          </View>
          <Text style={styles.headerTitle}>Supervising conversation</Text>
          <Text style={styles.headerSub}>{session.girlDisplayName}'s conversation</Text>
          <Text style={styles.participants}>{headerLine}</Text>
          <HuzzPressable style={styles.historyToggle} onPress={() => setShowHistory((v) => !v)} haptic="light">
            <Text style={styles.historyToggleText}>
              {showHistory ? 'Hide session history' : 'Session history'}
            </Text>
          </HuzzPressable>
          {showHistory ? (
            <View style={styles.historyBox}>
              <Text style={styles.historyHeading}>Visits on this invite</Text>
              {!visits.length ? (
                <Text style={styles.historyEmpty}>This is your first visit on this link.</Text>
              ) : (
                visits.map((v) => (
                  <Text key={v.id} style={styles.historyLine}>
                    {v.status === 'active' ? '● Now' : '○'}{' '}
                    {v.startedAt ? new Date(v.startedAt).toLocaleString() : '—'}
                    {v.endedAt ? ` → ${new Date(v.endedAt).toLocaleString()}` : ''}
                    {v.endReason ? ` (${v.endReason})` : ''}
                  </Text>
                ))
              )}
              {localHistory.length ? (
                <>
                  <Text style={[styles.historyHeading, { marginTop: 10 }]}>On this device</Text>
                  {localHistory.map((h, idx) => (
                    <Text key={`${h.accessId}-${idx}`} style={styles.historyLine}>
                      {h.event || 'opened'} · {h.girlDisplayName || 'Her'} ↔ {h.guyDisplayName || 'User'}
                      {h.recordedAt ? ` · ${new Date(h.recordedAt).toLocaleDateString()}` : ''}
                    </Text>
                  ))}
                </>
              ) : null}
            </View>
          ) : null}
        </View>

        {activeVideoSessionId && onNavigate ? (
          <View style={styles.videoBanner}>
            <Text style={styles.videoBannerTitle}>Chaperoned video date live</Text>
            <Text style={styles.videoBannerBody}>
              Join as a silent supervisor (listen-only). Your camera stays off.
            </Text>
            <HuzzPressable
              style={styles.videoJoinBtn}
              onPress={() =>
                onNavigate('matchVideoDate', {
                  matchId: session.matchId,
                  sessionId: activeVideoSessionId,
                  mehramMode: true,
                })
              }
              haptic="medium"
            >
              <Text style={styles.videoJoinBtnText}>Join video supervision</Text>
            </HuzzPressable>
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: true })}
          renderItem={({ item }) => (
            <MessageBubble
              item={item}
              girlUid={session.girlUserId}
              guyUid={session.guyUserId}
              girlDisplayName={session.girlDisplayName}
            />
          )}
        />

        <View style={styles.footer}>
          {canReply ? (
            <View style={styles.composerRow}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Message as Mehram…"
                placeholderTextColor={tokens.colors.textMuted}
                maxLength={2000}
                editable={!sending}
              />
              <HuzzPressable style={styles.sendBtn} onPress={handleSend} disabled={sending} haptic="light">
                {sending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.sendBtnText}>Send</Text>
                )}
              </HuzzPressable>
            </View>
          ) : (
            <View style={styles.viewOnlyBox}>
              <Text style={styles.viewOnlyText}>
                👁 You are viewing as a Mehram. Replying is disabled by {session.girlDisplayName}.
              </Text>
            </View>
          )}

          <View style={styles.actionsRow}>
            <HuzzPressable style={styles.outlineBtn} onPress={handleBlock} haptic="light">
              <Text style={styles.outlineBtnText}>Block</Text>
            </HuzzPressable>
            <HuzzPressable style={styles.outlineBtn} onPress={handleReport} haptic="light">
              <Text style={styles.outlineBtnText}>Report</Text>
            </HuzzPressable>
            <HuzzPressable style={styles.outlineBtn} onPress={handleLeave} haptic="light">
              <Text style={styles.outlineBtnText}>Leave</Text>
            </HuzzPressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
  },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.textOnBrand,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: tokens.colors.textOnBrand,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 14,
    color: tokens.colors.textMutedOnBrand,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(43,36,32,0.08)',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(14, 165, 233, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: tokens.colors.textOnBrand,
  },
  headerSub: {
    fontSize: 13,
    color: tokens.colors.textMutedOnBrand,
    marginTop: 2,
  },
  participants: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colors.textOnBrand,
    marginTop: 8,
  },
  historyToggle: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(43,36,32,0.06)',
  },
  historyToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.textOnBrand,
  },
  historyBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(43,36,32,0.08)',
    gap: 4,
  },
  historyHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.colors.textOnBrand,
    marginBottom: 2,
  },
  historyEmpty: {
    fontSize: 12,
    color: tokens.colors.textMutedOnBrand,
  },
  historyLine: {
    fontSize: 11,
    lineHeight: 16,
    color: tokens.colors.textMutedOnBrand,
  },
  listContent: {
    padding: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  msgWrap: {
    marginBottom: 10,
    maxWidth: '88%',
    alignSelf: 'flex-start',
  },
  msgWrapMine: {
    alignSelf: 'flex-end',
  },
  mehramLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
    marginBottom: 4,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bubbleGirl: {
    backgroundColor: '#8b5cf6',
  },
  bubbleGuy: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bubbleMehram: {
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.35)',
  },
  bubbleTheirs: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
    color: tokens.colors.text,
  },
  bubbleTextMine: {
    color: '#fff',
  },
  time: {
    fontSize: 10,
    opacity: 0.65,
    marginTop: 4,
    color: tokens.colors.textMuted,
  },
  timeMine: {
    color: 'rgba(255,255,255,0.75)',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(43,36,32,0.08)',
    backgroundColor: 'rgba(255,255,255,0.72)',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingHorizontal: 16,
    fontSize: 15,
    color: tokens.colors.text,
    backgroundColor: '#fff',
  },
  sendBtn: {
    minHeight: 44,
    minWidth: 72,
    borderRadius: 999,
    backgroundColor: '#2B2420',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  sendBtnText: {
    color: '#F7F1E8',
    fontWeight: '700',
    fontSize: 14,
  },
  viewOnlyBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
  },
  viewOnlyText: {
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textMuted,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  outlineBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: tokens.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  outlineBtnText: {
    fontWeight: '600',
    fontSize: 13,
    color: tokens.colors.textOnBrand,
  },
  videoBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.35)',
  },
  videoBannerTitle: {
    fontWeight: '700',
    color: tokens.colors.text,
    marginBottom: 4,
  },
  videoBannerBody: {
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
    marginBottom: 10,
  },
  videoJoinBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: tokens.colors.brandPink,
  },
  videoJoinBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
