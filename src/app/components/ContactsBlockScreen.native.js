import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import * as Contacts from 'expo-contacts';
import { authService, contactBlockService } from '../../services/firebaseService';
import { sha256 } from '../../utils/hash';
import { SafeAreaView } from 'react-native-safe-area-context';

function normalizePhone(p) {
  const digits = String(p || '').replace(/[^\d+]/g, '');
  return digits;
}

export function ContactsBlockScreen({ onNavigate }) {
  const [loading, setLoading] = useState(false);
  const [hashes, setHashes] = useState([]);
  const [manualEmail, setManualEmail] = useState('');

  const hashCount = hashes.length;

  const summary = useMemo(() => {
    if (hashCount === 0) return 'No contacts uploaded yet.';
    return `${hashCount} contact hash${hashCount === 1 ? '' : 'es'} ready to upload.`;
  }, [hashCount]);

  const importContacts = async () => {
    const uid = authService.getCurrentUser()?.uid;
    if (!uid) {
      onNavigate('onboarding', { mode: 'login' });
      return;
    }

    setLoading(true);
    try {
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow contacts access to use this feature.');
        return;
      }

      const res = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
        pageSize: 5000,
        pageOffset: 0,
      });

      const identifiers = [];
      for (const c of res.data || []) {
        for (const e of c.emails || []) {
          if (e?.email) identifiers.push(String(e.email).trim().toLowerCase());
        }
        for (const p of c.phoneNumbers || []) {
          if (p?.number) identifiers.push(normalizePhone(p.number));
        }
      }

      const unique = Array.from(new Set(identifiers.filter(Boolean)));
      const digests = [];
      for (const id of unique) {
        const h = await sha256(id);
        if (h) digests.push(h);
      }

      setHashes(Array.from(new Set(digests)));
      Alert.alert('Imported', `Prepared ${digests.length} hashed contact identifiers.`);
    } catch (e) {
      console.error('Import contacts error:', e);
      Alert.alert('Error', e?.message || 'Failed to import contacts.');
    } finally {
      setLoading(false);
    }
  };

  const uploadHashes = async () => {
    const uid = authService.getCurrentUser()?.uid;
    if (!uid) {
      onNavigate('onboarding', { mode: 'login' });
      return;
    }
    if (hashes.length === 0) {
      Alert.alert('Nothing to upload', 'Import contacts or add an email first.');
      return;
    }

    setLoading(true);
    try {
      const { count, error } = await contactBlockService.saveHashes(uid, hashes);
      if (error) Alert.alert('Error', error);
      else Alert.alert('Done', `Uploaded ${count} contact hashes.`);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to upload hashes.');
    } finally {
      setLoading(false);
    }
  };

  const addManualEmail = async () => {
    const email = String(manualEmail || '').trim().toLowerCase();
    if (!email) return;
    setLoading(true);
    try {
      const h = await sha256(email);
      if (!h) return;
      setHashes((prev) => Array.from(new Set([...prev, h])));
      setManualEmail('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => onNavigate('settings')}>
          <Text style={styles.headerBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Block contacts</Text>
        <View style={{ width: 70 }} />
      </View>

      <HuzzKeyboardAwareScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={styles.box}>
          <Text style={styles.boxTitle}>What this does</Text>
          <Text style={styles.boxText}>
            HUZZ will try to hide profiles that match your uploaded contact hashes. We only upload hashes (not raw contacts).
          </Text>
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Status</Text>
          <Text style={styles.boxText}>{summary}</Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#87ceeb', borderColor: '#4682b4' }]}
          disabled={loading}
          onPress={importContacts}
        >
          <Text style={styles.btnText}>{loading ? 'Loading...' : 'Import contacts (hash on device)'}</Text>
        </TouchableOpacity>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Add one email manually</Text>
          <TextInput
            style={styles.input}
            placeholder="someone@example.com"
            autoCapitalize="none"
            value={manualEmail}
            onChangeText={setManualEmail}
          />
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#ffff00' }]}
            disabled={loading}
            onPress={addManualEmail}
          >
            <Text style={styles.btnText}>Add email hash</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#90ee90', borderColor: '#228b22' }]}
          disabled={loading}
          onPress={uploadHashes}
        >
          <Text style={styles.btnText}>{loading ? 'Uploading...' : 'Save block list'}</Text>
        </TouchableOpacity>

        {loading && (
          <View style={{ alignItems: 'center', marginTop: 12 }}>
            <ActivityIndicator />
          </View>
        )}
      </HuzzKeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: '#8b4513',
    backgroundColor: '#ffffff',
  },
  headerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 3,
    borderColor: '#654321',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    width: 70,
    alignItems: 'center',
  },
  headerBtnText: { fontWeight: '900', color: '#000000' },
  title: { fontSize: 18, fontWeight: '900', color: '#8b4513', letterSpacing: 1 },
  box: {
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#654321',
    borderRadius: 12,
    padding: 14,
  },
  boxTitle: { fontSize: 12, fontWeight: '900', color: '#800020', letterSpacing: 1, marginBottom: 6 },
  boxText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  btn: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#654321',
    backgroundColor: '#c0c0c0',
  },
  btnText: { textAlign: 'center', fontWeight: '900', color: '#000000', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    marginTop: 10,
    marginBottom: 10,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#8b4513',
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#000000',
  },
});


