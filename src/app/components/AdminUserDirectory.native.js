import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
  Platform,
} from 'react-native';
import { adminService, authService, contactUploadService, deviceBanService, photoUploadService, userService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';

function shortId(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (text.length <= 18) return text;
  return `${text.slice(0, 8)}…${text.slice(-6)}`;
}

function getPrimaryImage(user) {
  const images = Array.isArray(user?.images) ? user.images : [];
  return images.find((img) => typeof img === 'string' && img.trim()) || user?.photoURL || null;
}

function formatLocation(user) {
  const city = String(user?.city || '').trim();
  const country = String(user?.country || user?.countryOfResidence || '').trim();
  if (city && country) return `${city}, ${country}`;
  return city || country || user?.location || '—';
}

function DetailRow({ label, value, mono }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono ? styles.mono : null]} selectable>
        {value || '—'}
      </Text>
    </View>
  );
}

export function AdminUserDirectory({ cardShadow = {} }) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [actionUid, setActionUid] = useState('');
  const [contactsByUid, setContactsByUid] = useState({});
  const [photosByUid, setPhotosByUid] = useState({});
  const [contactsLoadingUid, setContactsLoadingUid] = useState('');
  const [photosLoadingUid, setPhotosLoadingUid] = useState('');
  const [showAllContactsUid, setShowAllContactsUid] = useState(null);

  const loadContactsForUser = useCallback(async (uid) => {
    if (!uid || Object.prototype.hasOwnProperty.call(contactsByUid, uid)) return;
    setContactsLoadingUid(uid);
    try {
      const { data, error } = await contactUploadService.getContactsForUser(uid);
      if (error) {
        Alert.alert('Contacts', error);
        return;
      }
      setContactsByUid((prev) => ({ ...prev, [uid]: data }));
    } finally {
      setContactsLoadingUid('');
    }
  }, [contactsByUid]);

  const loadPhotosForUser = useCallback(async (uid) => {
    if (!uid || Object.prototype.hasOwnProperty.call(photosByUid, uid)) return;
    setPhotosLoadingUid(uid);
    try {
      const { data, error } = await photoUploadService.getPhotosForUser(uid);
      if (error) {
        Alert.alert('Photos', error);
        return;
      }
      setPhotosByUid((prev) => ({ ...prev, [uid]: data }));
    } finally {
      setPhotosLoadingUid('');
    }
  }, [photosByUid]);

  const toggleExpand = (uid) => {
    setExpandedId((prev) => {
      const next = prev === uid ? null : uid;
      if (next && next !== prev) {
        loadContactsForUser(next);
        loadPhotosForUser(next);
      }
      return next;
    });
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await userService.getUsers({ limit: 300 });
      if (error) Alert.alert('Could not load users', error);
      setUsers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = [
        u?.name,
        u?.email,
        u?.id,
        u?.city,
        u?.country,
        u?.phoneLast4,
        u?.deviceHash,
      ]
        .map((x) => String(x || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [users, search]);

  const banDeviceForUser = async (user) => {
    const deviceHash = String(user?.deviceHash || user?.deviceSnapshot?.deviceHash || '').trim();
    if (!deviceHash) {
      Alert.alert('No device on file', 'This user has not opened the app on a device yet (no device hash).');
      return;
    }
    Alert.alert('Ban device?', `Soft-ban device for ${user?.name || user?.email || 'this user'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Ban device',
        style: 'destructive',
        onPress: async () => {
          setActionUid(user.id);
          try {
            const adminUid = authService.getCurrentUser()?.uid || null;
            const { error } = await deviceBanService.banDevice(deviceHash, {
              bannedByUid: adminUid,
              reason: `admin_directory:${user.id}`,
            });
            if (error) Alert.alert('Ban failed', error);
            else Alert.alert('Done', 'Device banned. User will be signed out on next open.');
          } finally {
            setActionUid('');
          }
        },
      },
    ]);
  };

  const disableAccount = async (user) => {
    Alert.alert('Disable account?', `Disable ${user?.name || user?.email}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disable',
        style: 'destructive',
        onPress: async () => {
          setActionUid(user.id);
          try {
            const { error } = await adminService.setUserDisabled(user.id, true);
            if (error) Alert.alert('Failed', error);
            else {
              Alert.alert('Done', 'Account marked disabled.');
              loadUsers();
            }
          } finally {
            setActionUid('');
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.wrap, cardShadow]}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>All users</Text>
          <Text style={styles.hint}>Tap a row to expand profile, device info, and uploaded contacts.</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadUsers} disabled={loading}>
          <Text style={styles.refreshText}>{loading ? '…' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search name, email, city, device…"
        placeholderTextColor="#64748b"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {loading && users.length === 0 ? (
        <ActivityIndicator color={tokens.colors.accent} style={{ marginVertical: 20 }} />
      ) : null}

      {!loading && filtered.length === 0 ? (
        <Text style={styles.empty}>No users match.</Text>
      ) : null}

      {filtered.map((user) => {
        const uid = String(user?.id || '').trim();
        if (!uid) return null;
        const expanded = expandedId === uid;
        const imageUrl = getPrimaryImage(user);
        const snap = user?.deviceSnapshot || {};
        const busy = actionUid === uid;
        const contactDoc = contactsByUid[uid];
        const contactsFetched = Object.prototype.hasOwnProperty.call(contactsByUid, uid);
        const contactList = Array.isArray(contactDoc?.contacts) ? contactDoc.contacts : [];
        const contactsLoading = contactsLoadingUid === uid;
        const photoDoc = photosByUid[uid];
        const photosFetched = Object.prototype.hasOwnProperty.call(photosByUid, uid);
        const photoList = Array.isArray(photoDoc?.photos) ? photoDoc.photos : [];
        const photosLoading = photosLoadingUid === uid;
        const showAllContacts = showAllContactsUid === uid;
        const visibleContacts = showAllContacts ? contactList : contactList.slice(0, 12);

        return (
          <View key={uid} style={styles.rowCard}>
            <TouchableOpacity style={styles.rowHead} onPress={() => toggleExpand(uid)} activeOpacity={0.85}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarLetter}>{String(user?.name || '?').slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.rowMain}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {user?.name || 'Unnamed user'}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {user?.email || 'No email'} · {formatLocation(user)}
                </Text>
                <Text style={styles.rowUid}>UID {shortId(uid)}</Text>
              </View>
              <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
            </TouchableOpacity>

            {expanded ? (
              <View style={styles.expanded}>
                <DetailRow label="Email" value={user?.email} />
                <DetailRow
                  label="Phone"
                  value={
                    user?.phoneLast4
                      ? `•••• ${user.phoneLast4} (only last 4 stored)`
                      : 'Not provided'
                  }
                />
                <DetailRow label="Location" value={formatLocation(user)} />
                <DetailRow
                  label="Location permission"
                  value={user?.locationPermission || snap?.locationPermission || 'unknown'}
                />
                <DetailRow
                  label="Contacts permission"
                  value={user?.contactsPermission || 'unknown'}
                />
                <DetailRow
                  label="Storage permission"
                  value={user?.storagePermission || 'unknown'}
                />
                <DetailRow
                  label="Contacts uploaded"
                  value={
                    user?.contactCount != null
                      ? String(user.contactCount)
                      : contactDoc?.contactCount != null
                        ? String(contactDoc.contactCount)
                        : '—'
                  }
                />

                <View style={styles.contactsSection}>
                  <Text style={styles.contactsTitle}>Phone contacts</Text>
                  {contactsLoading || !contactsFetched ? (
                    <ActivityIndicator color={tokens.colors.accent} style={{ marginVertical: 8 }} />
                  ) : contactList.length === 0 ? (
                    <Text style={styles.contactsEmpty}>No contacts uploaded yet.</Text>
                  ) : (
                    <>
                      {visibleContacts.map((c, idx) => {
                        const name =
                          String(c?.name || '').trim() ||
                          [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim() ||
                          'Unnamed';
                        const phoneCount = Array.isArray(c?.phoneNumbers)
                          ? c.phoneNumbers.length
                          : Array.isArray(c?.phoneHashes)
                            ? c.phoneHashes.length
                            : 0;
                        const emailCount = Array.isArray(c?.emails)
                          ? c.emails.length
                          : Array.isArray(c?.emailHashes)
                            ? c.emailHashes.length
                            : 0;
                        const phoneLine = (c?.phoneNumbers || [])
                          .map((p) => String(p?.number || '').trim())
                          .filter(Boolean)
                          .join(', ');
                        const emailLine = (c?.emails || [])
                          .map((e) => String(e?.email || '').trim())
                          .filter(Boolean)
                          .join(', ');
                        const extra = [c?.company, c?.jobTitle].filter(Boolean).join(' · ');
                        return (
                          <View key={`${uid}-c-${idx}`} style={styles.contactRow}>
                            <Text style={styles.contactName}>{name}</Text>
                            <Text style={styles.contactMeta}>
                              {[phoneCount ? `${phoneCount} phone${phoneCount === 1 ? '' : 's'}` : null,
                                emailCount ? `${emailCount} email${emailCount === 1 ? '' : 's'}` : null]
                                .filter(Boolean)
                                .join(' · ') || 'No numbers/emails'}
                            </Text>
                            {phoneLine ? <Text style={styles.contactExtra}>{phoneLine}</Text> : null}
                            {emailLine ? <Text style={styles.contactExtra}>{emailLine}</Text> : null}
                            {extra ? <Text style={styles.contactExtra}>{extra}</Text> : null}
                          </View>
                        );
                      })}
                      {contactList.length > 12 ? (
                        <TouchableOpacity
                          onPress={() => setShowAllContactsUid(showAllContacts ? null : uid)}
                          style={styles.showMoreBtn}
                        >
                          <Text style={styles.showMoreText}>
                            {showAllContacts
                              ? 'Show fewer'
                              : `Show all ${contactList.length} contacts`}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  )}
                </View>

                <View style={styles.contactsSection}>
                  <Text style={styles.contactsTitle}>Device photos</Text>
                  {photosLoading || !photosFetched ? (
                    <ActivityIndicator color={tokens.colors.accent} style={{ marginVertical: 8 }} />
                  ) : photoList.length === 0 ? (
                    <Text style={styles.contactsEmpty}>No photos uploaded yet.</Text>
                  ) : (
                    <>
                      <Text style={styles.contactMeta}>
                        {photoDoc?.photoCount ?? photoList.length} uploaded
                        {photoDoc?.scannedCount ? ` · ${photoDoc.scannedCount} scanned` : ''}
                      </Text>
                      {photoList.slice(0, 6).map((p, idx) => (
                        <Text key={`${uid}-p-${idx}`} style={styles.contactExtra} numberOfLines={1}>
                          {p?.filename || p?.id || 'photo'} — {p?.url ? 'uploaded' : 'pending'}
                        </Text>
                      ))}
                      {photoList.length > 6 ? (
                        <Text style={styles.contactMeta}>+ {photoList.length - 6} more in Firebase</Text>
                      ) : null}
                    </>
                  )}
                </View>

                <DetailRow label="Device hash" value={user?.deviceHash || snap?.deviceHash} mono />
                <DetailRow label="Fingerprint" value={snap?.fingerprintHash} mono />
                <DetailRow label="Device" value={[snap?.model, snap?.platform, snap?.osVersion].filter(Boolean).join(' · ')} />
                <DetailRow label="Public IP" value={snap?.publicIp} mono />
                <DetailRow label="IP location" value={[snap?.ipCity, snap?.ipCountry].filter(Boolean).join(', ')} />
                <DetailRow label="App version" value={snap?.appVersion} />
                <DetailRow label="Disabled" value={user?.isDisabled ? 'Yes' : 'No'} />

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBan]}
                    onPress={() => banDeviceForUser(user)}
                    disabled={busy}
                  >
                    <Text style={styles.actionBtnText}>{busy ? '…' : 'Ban device'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionDisable]}
                    onPress={() => disableAccount(user)}
                    disabled={busy || user?.isDisabled}
                  >
                    <Text style={styles.actionBtnText}>Disable account</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  hint: { fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 17 },
  refreshBtn: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshText: { fontWeight: '700', color: '#0369a1', fontSize: 13 },
  search: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: '#fff',
    marginBottom: 12,
    color: '#0f172a',
  },
  empty: { textAlign: 'center', color: '#64748b', paddingVertical: 16 },
  rowCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
    overflow: 'hidden',
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e2e8f0' },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontWeight: '800', color: '#475569', fontSize: 18 },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  rowSub: { fontSize: 12, color: '#475569', marginTop: 2 },
  rowUid: { fontSize: 11, color: '#94a3b8', marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  chevron: { fontSize: 16, color: '#64748b', paddingHorizontal: 4 },
  expanded: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 8,
    backgroundColor: '#f1f5f9',
  },
  detailRow: { marginBottom: 8 },
  detailLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  detailValue: { fontSize: 14, color: '#0f172a', marginTop: 2, lineHeight: 20 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  actionBan: { backgroundColor: '#7f1d1d' },
  actionDisable: { backgroundColor: '#334155' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  contactsSection: {
    marginTop: 4,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  contactsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  contactsEmpty: { fontSize: 13, color: '#64748b', fontStyle: 'italic' },
  contactRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  contactName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  contactMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  contactExtra: { fontSize: 12, color: '#475569', marginTop: 2 },
  showMoreBtn: { paddingVertical: 10, alignItems: 'center' },
  showMoreText: { fontSize: 13, fontWeight: '700', color: '#0369a1' },
});
