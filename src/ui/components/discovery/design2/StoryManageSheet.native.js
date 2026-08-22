import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeOff, Trash2, Users, X } from 'lucide-react-native';
import { tokens } from '../../../tokens';
import { HuzzPressable } from '../../HuzzPressable.native';
import { clubService } from '../../../../services/firebaseService';
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
}) {
  const insets = useSafeAreaInsets();
  const [hiddenFrom, setHiddenFrom] = useState([]);
  const [viewers, setViewers] = useState([]);
  const [usernameInput, setUsernameInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('viewers');
  const [privacyError, setPrivacyError] = useState('');
  const [viewersError, setViewersError] = useState('');
  const [selectedStoryId, setSelectedStoryId] = useState(activeStoryId);

  useEffect(() => {
    if (visible) setSelectedStoryId(activeStoryId);
  }, [visible, activeStoryId]);

  const storyIdForViewers = selectedStoryId || activeStoryId;

  useEffect(() => {
    if (!visible || !authorUid) return undefined;
    setPrivacyError('');
    const unsub = listenStoryPrivacy(authorUid, ({ data, error }) => {
      if (error) {
        setPrivacyError(error);
        setHiddenFrom([]);
        return;
      }
      setHiddenFrom(Array.isArray(data?.hiddenFrom) ? data.hiddenFrom : []);
    });
    return () => unsub && unsub();
  }, [visible, authorUid]);

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
    if (!raw || !authorUid) return;
    setBusy(true);
    try {
      const { uid, error } = await clubService.lookupUsername(raw);
      if (error || !uid) {
        Alert.alert('Not found', error || 'Username not found.');
        return;
      }
      if (String(uid) === String(authorUid)) {
        Alert.alert('Nope', "You can't hide your story from yourself.");
        return;
      }
      const { error: hideErr } = await addStoryHiddenFrom(authorUid, uid, raw.replace(/^@+/, ''));
      if (hideErr) Alert.alert('Error', hideErr);
      else {
        setUsernameInput('');
        Alert.alert('Hidden', `@${raw.replace(/^@+/, '')} won't see your stories anymore.`);
      }
    } finally {
      setBusy(false);
    }
  }, [authorUid, usernameInput]);

  const handleRemoveHidden = useCallback(
    async (targetUid) => {
      if (!authorUid || !targetUid) return;
      setBusy(true);
      try {
        const { error } = await removeStoryHiddenFrom(authorUid, targetUid);
        if (error) Alert.alert('Error', error);
      } finally {
        setBusy(false);
      }
    },
    [authorUid]
  );

  const handleDeleteCurrent = useCallback(() => {
    const targetId = storyIdForViewers;
    if (!targetId || !authorUid) return;
    Alert.alert('Delete this story?', 'It will disappear for everyone immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const { error } = await deleteStory(targetId, authorUid);
            if (error) Alert.alert('Error', error);
            else {
              Alert.alert('Deleted', 'Story removed.');
              onStoriesChanged?.();
              onClose?.();
            }
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [storyIdForViewers, authorUid, onClose, onStoriesChanged]);

  const handleDeleteAll = useCallback(() => {
    if (!authorUid || !myStories.length) return;
    Alert.alert('Delete all stories?', `Remove all ${myStories.length} active stories?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const { error } = await deleteAllMyStories(authorUid, myStories);
            if (error) Alert.alert('Error', error);
            else {
              Alert.alert('Deleted', 'All stories removed.');
              onStoriesChanged?.();
              onClose?.();
            }
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [authorUid, myStories, onClose, onStoriesChanged]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Story settings</Text>
            <HuzzPressable onPress={onClose} haptic="light" accessibilityLabel="Close story settings">
              <X size={22} color={tokens.colors.text} strokeWidth={2.3} />
            </HuzzPressable>
          </View>

          <View style={styles.tabs}>
            <HuzzPressable
              style={[styles.tab, tab === 'viewers' && styles.tabActive]}
              onPress={() => setTab('viewers')}
              haptic="light"
            >
              <Eye size={16} color={tab === 'viewers' ? '#fff' : tokens.colors.brandPinkDeep} />
              <Text style={[styles.tabText, tab === 'viewers' && styles.tabTextActive]}>Viewers</Text>
            </HuzzPressable>
            <HuzzPressable
              style={[styles.tab, tab === 'privacy' && styles.tabActive]}
              onPress={() => setTab('privacy')}
              haptic="light"
            >
              <EyeOff size={16} color={tab === 'privacy' ? '#fff' : tokens.colors.brandPinkDeep} />
              <Text style={[styles.tabText, tab === 'privacy' && styles.tabTextActive]}>Hide from</Text>
            </HuzzPressable>
            <HuzzPressable
              style={[styles.tab, tab === 'delete' && styles.tabActive]}
              onPress={() => setTab('delete')}
              haptic="light"
            >
              <Trash2 size={16} color={tab === 'delete' ? '#fff' : tokens.colors.brandPinkDeep} />
              <Text style={[styles.tabText, tab === 'delete' && styles.tabTextActive]}>Delete</Text>
            </HuzzPressable>
          </View>

          {busy ? (
            <ActivityIndicator style={styles.loader} color={tokens.colors.brandPink} />
          ) : null}

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {tab === 'viewers' ? (
              <>
                <View style={styles.infoBox}>
                  <Users size={18} color={tokens.colors.brandPinkDeep} />
                  <Text style={styles.infoText}>
                    Who can view: everyone on Huzz, except people on your hide list. Only other
                    accounts show up in the viewer list — not you.
                  </Text>
                </View>
                {myStories.length > 1 ? (
                  <>
                    <Text style={styles.sectionLabel}>Pick a story</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storyPickRow}>
                      {myStories.map((s, idx) => (
                        <HuzzPressable
                          key={s.id}
                          style={[
                            styles.storyPickChip,
                            storyIdForViewers === s.id && styles.storyPickChipActive,
                          ]}
                          onPress={() => setSelectedStoryId(s.id)}
                          haptic="light"
                        >
                          <Text
                            style={[
                              styles.storyPickText,
                              storyIdForViewers === s.id && styles.storyPickTextActive,
                            ]}
                          >
                            Story {idx + 1}
                          </Text>
                        </HuzzPressable>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
                <Text style={styles.sectionLabel}>Who viewed this story</Text>
                {viewersError ? (
                  <Text style={styles.errorText}>{viewersError}</Text>
                ) : null}
                {!storyIdForViewers ? (
                  <Text style={styles.empty}>Post a story first to see viewers.</Text>
                ) : viewers.length === 0 ? (
                  <Text style={styles.empty}>No views yet — share your story or wait for people to watch.</Text>
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
                  />
                  <HuzzPressable style={styles.addBtn} onPress={handleAddHidden} haptic="light">
                    <Text style={styles.addBtnText}>Add</Text>
                  </HuzzPressable>
                </View>
                <Text style={styles.sectionLabel}>Hidden from ({hiddenFrom.length})</Text>
                {privacyError ? (
                  <Text style={styles.errorText}>{privacyError}</Text>
                ) : null}
                {hiddenFrom.length === 0 ? (
                  <Text style={styles.empty}>Nobody hidden — all users can see your story</Text>
                ) : (
                  hiddenFrom.map((entry) => (
                    <View key={entry.uid} style={styles.hiddenRow}>
                      <Text style={styles.hiddenName}>@{entry.label || entry.uid}</Text>
                      <HuzzPressable
                        onPress={() => handleRemoveHidden(entry.uid)}
                        haptic="light"
                        accessibilityLabel={`Unhide from ${entry.label}`}
                      >
                        <Text style={styles.unhide}>Unhide</Text>
                      </HuzzPressable>
                    </View>
                  ))
                )}
              </>
            ) : null}

            {tab === 'delete' ? (
              <>
                <Text style={styles.sectionLabel}>Remove stories</Text>
                <HuzzPressable
                  style={styles.dangerBtn}
                  onPress={handleDeleteCurrent}
                  haptic="light"
                  disabled={!storyIdForViewers}
                >
                  <Trash2 size={18} color="#fff" />
                  <Text style={styles.dangerBtnText}>Delete this story</Text>
                </HuzzPressable>
                <HuzzPressable
                  style={[styles.dangerBtn, styles.dangerBtnOutline]}
                  onPress={handleDeleteAll}
                  haptic="light"
                  disabled={!myStories.length}
                >
                  <Trash2 size={18} color="#BE123C" />
                  <Text style={styles.dangerBtnTextOutline}>
                    Delete all active stories ({myStories.length})
                  </Text>
                </HuzzPressable>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '78%',
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
});
