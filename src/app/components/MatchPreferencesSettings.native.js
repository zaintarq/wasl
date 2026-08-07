import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { authService, userService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
import { RetroButton } from '../../ui/components/RetroButton.native';

const GENDERS = ['Male', 'Female'];

export function MatchPreferencesSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gender, setGender] = useState('');
  const [genderPreferences, setGenderPreferences] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const uid = authService.getCurrentUser()?.uid;
      if (!uid) return;
      const res = await userService.getUserById(uid);
      const p = res?.data || {};
      setGender(String(p.gender || '').trim());
      setGenderPreferences(Array.isArray(p.genderPreferences) ? [...p.genderPreferences] : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const togglePreference = (key) => {
    setGenderPreferences((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  };

  const save = async () => {
    const uid = authService.getCurrentUser()?.uid;
    if (!uid) return;
    if (!gender) {
      Alert.alert('Select your gender', 'We use this to show you relevant people in discovery.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await userService.updateUser(uid, {
        gender,
        genderPreferences,
        genderPreferencesSet: genderPreferences.length > 0,
      });
      if (error) Alert.alert('Could not save', error);
      else Alert.alert('Saved', 'Your discovery preferences were updated.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <ActivityIndicator color={tokens.colors.accent} style={{ marginVertical: 12 }} />;
  }

  const usingDefaults = genderPreferences.length === 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        By default, men see women and women see men in discovery. Change who you want to connect with below
        only if you prefer something different.
      </Text>

      <Text style={styles.label}>Your gender</Text>
      <View style={styles.row}>
        {GENDERS.map((g) => (
          <TouchableOpacity
            key={g}
            style={[styles.chip, gender === g && styles.chipOn]}
            onPress={() => setGender(g)}
          >
            <Text style={[styles.chipText, gender === g && styles.chipTextOn]}>{g}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Connect with (optional)</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.chip, genderPreferences.includes('boys') && styles.chipOn]}
          onPress={() => togglePreference('boys')}
        >
          <Text style={[styles.chipText, genderPreferences.includes('boys') && styles.chipTextOn]}>Men</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, genderPreferences.includes('girls') && styles.chipOn]}
          onPress={() => togglePreference('girls')}
        >
          <Text style={[styles.chipText, genderPreferences.includes('girls') && styles.chipTextOn]}>Women</Text>
        </TouchableOpacity>
      </View>

      {usingDefaults ? (
        <Text style={styles.defaultNote}>Using default discovery settings.</Text>
      ) : (
        <Text style={styles.defaultNote}>Custom discovery settings active.</Text>
      )}

      <RetroButton
        variant="blue"
        title={saving ? 'Saving…' : 'Save preferences'}
        onPress={save}
        disabled={saving}
        style={{ marginTop: 12 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.colors.text,
    marginBottom: 8,
    marginTop: 4,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: '#fff',
  },
  chipOn: {
    backgroundColor: tokens.colors.filterBgSky,
    borderColor: tokens.colors.blue,
  },
  chipText: { fontWeight: '700', color: tokens.colors.text },
  chipTextOn: { color: tokens.colors.blue },
  defaultNote: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textMuted,
    marginTop: 6,
  },
});
