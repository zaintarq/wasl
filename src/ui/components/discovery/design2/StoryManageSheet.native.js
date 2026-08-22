import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeOff, Trash2, Users, X } from 'lucide-react-native';
import { tokens } from '../../../tokens';
import { authService, clubService } from '../../../../services/firebaseService';
import {
  addStoryHiddenFrom,
  deleteAllMyStories,
  deleteStory,
  listenStoryPrivacy,
  listenStoryViewers,
  removeStoryHiddenFrom,
} from '../../../../services/storyService';

export function StoryManageSheet({
  visible,
  onClose,
  authorUid,
  activeStoryId = null,
  myStories = [],
  onStoriesChanged,
  embedded = false,
}) {
  const insets = useSafeAreaInsets();
  const ownerUid = authorUid || authService.getCurrentUser()?.uid || null;
  const [hiddenFrom, setHiddenFrom] = useState([]);
  const [viewers, setViewers] = useState([]);
  const [usernameInput, setUsernameInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('viewers');
  const [privacyError, setPrivacyError] = useState('');
  const [viewersError, setViewersError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [selectedStoryId, setSelectedStoryId] = useState(activeStoryId);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    if (visible) {
      setSelectedStoryId(activeStoryId);
      setConfirmDelete(null);
      setStatusMsg('');
    }
  }, [visible, activeStoryId]);

  const storyIdForViewers = selectedStoryId || activeStoryId || myStories[0]?.id || null;

  useEffect(() => {
    if (!visible || !ownerUid) return undefined;
    setPrivacyError('');
    const unsub = listenStoryPrivacy(ownerUid, ({ data, error }) => {
      if (error) {
        setPrivacyError(error);
        setHiddenFrom([]);
        return;
      }
      setHiddenFrom(Array.isArray(data?.hiddenFrom) ? data.hiddenFrom : []);
    });
    return () => unsub && unsub();
  }, [visible, ownerUid]);

  useEffect(() => {
    if (!visible || !storyIdForViewers) {
      setViewers([]);
      setViewersError('');
      return undefined;
    }
    setViewersError('');
    const unsub = listenStoryViewers(storyIdForViewers, ({ data, error }) => {
      if (error) {
        setViewersError(error);
        setViewers([]);
        return;
      }
      setViewers(Array.isArray(data) ? data : []);
    });
    return () => unsub && unsub();
  }, [visible, storyIdForViewers]);

  const handleAddHidden = useCallback(async () => {
    const raw = String(usernameInput || '').trim();
    if (!raw || !ownerUid) {
      setStatusMsg('Enter a username first.');
      return;
    }
    setBusy(true);
    setStatusMsg('');
    try {
      const { uid, error } = await clubService.lookupUsername(raw);
      if (error || !uid) {
        setStatusMsg(error || 'Username not found. They need a @username on Huzz.');
        return;
      }
      if (String(uid) === String(ownerUid)) {
        setStatusMsg("You can't hide your story from yourself.");
        return;
      }
      const { error: hideErr } = await addStoryHiddenFrom(ownerUid, uid, raw.replace(/^@+/, ''));
      if (hideErr) setStatusMsg(hideErr);
      else {
        setUsernameInput('');
        setStatusMsg(`Hidden from @${raw.replace(/^@+/, '')}.`);
      }
    } finally {
      setBusy(false);
    }
  }, [ownerUid, usernameInput]);

  const handleRemoveHidden = useCallback(
    async (targetUid) => {
      if (!ownerUid || !targetUid) return;
      setBusy(true);
      setStatusMsg('');
      try {
        const { error } = await removeStoryHiddenFrom(ownerUid, targetUid);
        if (error) setStatusMsg(error);
        else setStatusMsg('User unhidden.');
      } finally {
        setBusy(false);
      }
    },
    [ownerUid]
  );

  const runDeleteOne = useCallback(async () => {
    const targetId = storyIdForViewers;
    if (!targetId || !ownerUid) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const { error } = await deleteStory(targetId, ownerUid);
      if (error) setStatusMsg(error);
      else {
        setStatusMsg('Story deleted.');
        setConfirmDelete(null);
        onStoriesChanged?.();
        onClose?.();
      }
    } finally {
      setBusy(false);
    }
  }, [storyIdForViewers, ownerUid, onClose, onStoriesChanged]);

  const runDeleteAll = useCallback(async () => {
    if (!ownerUid || !myStories.length) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const { error } = await deleteAllMyStories(ownerUid, myStories);
      if (error) setStatusMsg(error);
      else {
        setStatusMsg('All stories deleted.');
        setConfirmDelete(null);
        onStoriesChanged?.();
        onClose?.();
      }
    } finally {
      setBusy(false);
    }
  }, [ownerUid, myStories, onClose, onStoriesChanged]);

  if (!visible) return null;

  const sheetBody = (
    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.sheetHead}>
        <Text style={styles.sheetTitle}>Story settings</Text>
        <TouchableOpacity onPress={onClose} accessibilityLabel="Close story settings" hitSlop={12}>
          <X size={22} color={tokens.colors.text} strokeWidth={2.3} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {[
          { id: 'viewers', label: 'Viewers', Icon: Eye },
          { id: 'privacy', label: 'Hide from', Icon: EyeOff },
          { id: 'delete', label: 'Delete', Icon: Trash2 },
        ].map(({ id, label, Icon }) => (
          <TouchableOpacity
            key={id}
            style={[styles.tab, tab === id && styles.tabActive]}
            onPress={() => {
              setTab(id);
              setConfirmDelete(null);
            }}
            activeOpacity={0.85}
          >
            <Icon size={16} color={tab === id ? '#fff' : tokens.colors.brandPinkDeep} />
            <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {busy ? <ActivityIndicator style={styles.loader} color={tokens.colors.brandPink} /> : null}
      {statusMsg ? <Text style={styles.statusMsg}>{statusMsg}</Text> : null}
      {!ownerUid ? (
        <Text style={styles.errorText}>Not signed in — close and try again.</Text>
      ) : null}

      <ScrollView style={styles.body} keyboardShouldPersistTaps="always" nestedScrollEnabled>
        {tab === 'viewers' ? (
          <>
            <View style={styles.infoBox}>
              <Users size={18} color={tokens.colors.brandPinkDeep} />
              <Text style={styles.infoText}>
                Everyone on Huzz can view except people on your hide list. Only other accounts
                appear here — not you.
              </Text>
            </View>
            {myStories.length > 1 ? (
              <>
                <Text style={styles.sectionLabel}>Pick a story</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storyPickRow}>
                  {myStories.map((s, idx) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[
                        styles.storyPickChip,
                        storyIdForViewers === s.id && styles.storyPickChipActive,
                      ]}
                      onPress={() => setSelectedStoryId(s.id)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.storyPickText,
                          storyIdForViewers === s.id && styles.storyPickTextActive,
                        ]}
                      >
                        Story {idx + 1}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : null}
            <Text style={styles.sectionLabel}>Who viewed this story</Text>
            {viewersError ? <Text style={styles.errorText}>{viewersError}</Text> : null}
            {!storyIdForViewers ? (
              <Text style={styles.empty}>Post a story first to see viewers.</Text>
            ) : viewers.length === 0 ? (
              <Text style={styles.empty}>No views yet.</Text>
            ) : (
              viewers.map((v) => (
                <Text key={v.viewerUid || v.id} style={styles.row}>
                  {v.viewerName || 'User'}
                </Text>
              ))
            )}
          </>
        ) : null}

        {tab === 'privacy' ? (
          <>
            <Text style={styles.sectionLabel}>Hide story from username</Text>
            <Text style={styles.hint}>They won&apos;t see any of your stories.</Text>
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                value={usernameInput}
                onChangeText={setUsernameInput}
                placeholder="@username"
                placeholderTextColor={tokens.colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleAddHidden}
              />
              <TouchableOpacity style={styles.addBtn} onPress={handleAddHidden} activeOpacity={0.85}>
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionLabel}>Hidden from ({hiddenFrom.length})</Text>
            {privacyError ? <Text style={styles.errorText}>{privacyError}</Text> : null}
            {hiddenFrom.length === 0 ? (
              <Text style={styles.empty}>Nobody hidden yet.</Text>
            ) : (
              hiddenFrom.map((entry) => (
                <View key={entry.uid} style={styles.hiddenRow}>
                  <Text style={styles.hiddenName}>@{entry.label || entry.uid}</Text>
                  <TouchableOpacity onPress={() => handleRemoveHidden(entry.uid)} hitSlop={8}>
                    <Text style={styles.unhide}>Unhide</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        ) : null}

        {tab === 'delete' ? (
          <>
            <Text style={styles.sectionLabel}>Remove stories</Text>
            {confirmDelete === 'one' ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>Delete this story for everyone?</Text>
                <View style={styles.confirmRow}>
                  <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmDelete(null)}>
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmDanger} onPress={runDeleteOne}>
                    <Text style={styles.confirmDangerText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.dangerBtn, !storyIdForViewers && styles.dangerBtnDisabled]}
                onPress={() => storyIdForViewers && setConfirmDelete('one')}
                activeOpacity={0.85}
                disabled={!storyIdForViewers}
              >
                <Trash2 size={18} color="#fff" />
                <Text style={styles.dangerBtnText}>Delete this story</Text>
              </TouchableOpacity>
            )}

            {confirmDelete === 'all' ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>Delete all {myStories.length} active stories?</Text>
                <View style={styles.confirmRow}>
                  <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmDelete(null)}>
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmDanger} onPress={runDeleteAll}>
                    <Text style={styles.confirmDangerText}>Delete all</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.dangerBtn,
                  styles.dangerBtnOutline,
                  !myStories.length && styles.dangerBtnDisabled,
                ]}
                onPress={() => myStories.length && setConfirmDelete('all')}
                activeOpacity={0.85}
                disabled={!myStories.length}
              >
                <Trash2 size={18} color="#BE123C" />
                <Text style={styles.dangerBtnTextOutline}>
                  Delete all active stories ({myStories.length})
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );

  if (embedded) {
    return (
      <View style={styles.embeddedRoot} pointerEvents="box-none">
        <Pressable style={styles.backdrop} onPress={onClose} />
        {sheetBody}
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdropModal}>
        {sheetBody}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  embeddedRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  backdropModal: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '82%',
    paddingTop: 14,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: tokens.colors.text,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(251, 207, 232, 0.45)',
  },
  tabActive: {
    backgroundColor: tokens.colors.brandPinkDeep,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.brandPinkDeep,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  loader: { marginVertical: 8 },
  statusMsg: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colors.brandPinkDeep,
    paddingHorizontal: 18,
    marginBottom: 6,
  },
  body: {
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(251, 207, 232, 0.35)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.text,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.colors.text,
    marginBottom: 6,
    marginTop: 4,
  },
  hint: {
    fontSize: 12,
    color: tokens.colors.textMuted,
    marginBottom: 10,
  },
  empty: {
    fontSize: 13,
    color: tokens.colors.textMuted,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#BE123C',
    fontWeight: '600',
    marginBottom: 10,
    paddingHorizontal: 18,
  },
  storyPickRow: {
    marginBottom: 12,
    maxHeight: 44,
  },
  storyPickChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(251, 207, 232, 0.45)',
    marginRight: 8,
  },
  storyPickChipActive: {
    backgroundColor: tokens.colors.brandPinkDeep,
  },
  storyPickText: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.colors.brandPinkDeep,
  },
  storyPickTextActive: {
    color: '#FFFFFF',
  },
  row: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.text,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: tokens.colors.text,
  },
  addBtn: {
    backgroundColor: tokens.colors.brandPinkDeep,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  hiddenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
  },
  hiddenName: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  unhide: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.colors.brandPinkDeep,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#BE123C',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 10,
  },
  dangerBtnDisabled: {
    opacity: 0.45,
  },
  dangerBtnOutline: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
  },
  dangerBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  dangerBtnTextOutline: {
    color: '#BE123C',
    fontWeight: '800',
    fontSize: 15,
  },
  confirmBox: {
    backgroundColor: '#FFF1F2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colors.text,
    marginBottom: 12,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmCancel: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  confirmCancelText: {
    fontWeight: '700',
    color: tokens.colors.text,
  },
  confirmDanger: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#BE123C',
  },
  confirmDangerText: {
    fontWeight: '800',
    color: '#fff',
  },
});
