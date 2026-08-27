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
  Linking,
} from 'react-native';
import {
  adminService,
  authService,
  deviceBanService,
  privacyAdminService,
  userService,
} from '../../services/firebaseService';
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

  const toggleExpand = (uid) => {
    setExpandedId((prev) => (prev === uid ? null : uid));
  };

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

  const toggleShadowBan = async (user) => {
    const next = !user?.isShadowBanned;
    Alert.alert(
      next ? 'Shadowban user?' : 'Lift shadowban?',
      next
        ? `${user?.name || user?.email} will stay able to log in but disappear from discovery.`
        : `Show ${user?.name || user?.email} in discovery again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: next ? 'Shadowban' : 'Lift',
          style: next ? 'destructive' : 'default',
          onPress: async () => {
            setActionUid(user.id);
            try {
              const { error } = await adminService.setUserShadowBanned(user.id, next);
              if (error) Alert.alert('Failed', error);
              else {
                Alert.alert('Done', next ? 'User shadowbanned.' : 'Shadowban lifted.');
                loadUsers();
              }
            } finally {
              setActionUid('');
            }
          },
        },
      ]
    );
  };

  const exportDsarForUser = async (user) => {
    const uid = String(user?.id || '').trim();
    if (!uid) return;
    setActionUid(uid);
    try {
      const res = await privacyAdminService.exportUserDataPacket({ uid });
      if (res.error) {
        Alert.alert('Export failed', res.error);
        return;
      }
      const zipUrl = res.data?.zipUrl;
      const jsonUrl = res.data?.jsonUrl;
      Alert.alert(
        'DSAR packet ready',
        `${user?.name || user?.email || uid}\nJSON ${Math.round((res.data?.bytes || 0) / 1024)} KB · expires ${res.data?.expiresAt || '7 days'}.`,
        [
          { text: 'OK', style: 'cancel' },
          zipUrl
            ? {
                text: 'Open ZIP',
                onPress: () => Linking.openURL(zipUrl).catch(() => {}),
              }
            : null,
          jsonUrl
            ? {
                text: 'Open JSON',
                onPress: () => Linking.openURL(jsonUrl).catch(() => {}),
              }
            : null,
        ].filter(Boolean)
      );
    } finally {
      setActionUid('');
    }
  };

  return (
    <View style={[styles.wrap, cardShadow]}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>All users</Text>
          <Text style={styles.hint}>Tap a row to expand email, phone, location, and device info.</Text>
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
                <DetailRow label="Device hash" value={user?.deviceHash || snap?.deviceHash} mono />
                <DetailRow label="Fingerprint" value={snap?.fingerprintHash} mono />
                <DetailRow label="Device" value={[snap?.model, snap?.platform, snap?.osVersion].filter(Boolean).join(' · ')} />
                <DetailRow label="Public IP" value={snap?.publicIp} mono />
                <DetailRow label="IP location" value={[snap?.ipCity, snap?.ipCountry].filter(Boolean).join(', ')} />
                <DetailRow label="App version" value={snap?.appVersion} />
                <DetailRow label="Disabled" value={user?.isDisabled ? 'Yes' : 'No'} />
                <DetailRow label="Shadowbanned" value={user?.isShadowBanned ? 'Yes' : 'No'} />

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
                  <TouchableOpacity
                    style={[styles.actionBtn, user?.isShadowBanned ? styles.actionUnshadow : styles.actionShadow]}
                    onPress={() => toggleShadowBan(user)}
                    disabled={busy}
                  >
                    <Text style={styles.actionBtnText}>
                      {user?.isShadowBanned ? 'Lift shadowban' : 'Shadowban'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionExport]}
                    onPress={() => exportDsarForUser(user)}
                    disabled={busy}
                  >
                    <Text style={styles.actionBtnText}>{busy ? '…' : 'Export DSAR'}</Text>
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
  actionShadow: { backgroundColor: '#6b2148' },
  actionUnshadow: { backgroundColor: '#0f766e' },
  actionExport: { backgroundColor: '#1d4ed8' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
