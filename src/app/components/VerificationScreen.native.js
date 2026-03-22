import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { authService, verificationService } from '../../services/firebaseService';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';

export function VerificationScreen({ onNavigate }) {
  const uid = authService.getCurrentUser()?.uid || null;
  const [language, setLanguage] = useState('en'); // en|ur
  const [selfieUri, setSelfieUri] = useState('');
  const [videoUri, setVideoUri] = useState('');
  const [loading, setLoading] = useState(false);
  const [latest, setLatest] = useState(null);

  const script = useMemo(() => {
    if (language === 'ur') {
      return 'میرا نام ____ ہے، میری عمر ____ سال ہے، اور میں HUZZ پر اپنا اکاؤنٹ بنا رہا/رہی ہوں۔';
    }
    return 'My name is ____, I am ____ years old, and I am making this account on HUZZ.';
  }, [language]);

  const refresh = async () => {
    if (!uid) return;
    const res = await verificationService.getMyLatest(uid);
    setLatest(res?.data || null);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const pickSelfie = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: [ImagePicker.MediaType.Images],
      allowsEditing: true,
      quality: 0.8,
    });
    if (res.canceled) return;
    const uri = res.assets?.[0]?.uri || '';
    setSelfieUri(uri);
  };

  const recordVideo = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: [ImagePicker.MediaType.Videos],
      videoMaxDuration: 12, // short and easy to review
      quality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    if (res.canceled) return;
    const uri = res.assets?.[0]?.uri || '';
    setVideoUri(uri);
  };

  const submit = async () => {
    if (!uid) {
      onNavigate('onboarding', { mode: 'login' });
      return;
    }
    if (!selfieUri || !videoUri) {
      Alert.alert('Missing', 'Please capture a selfie and a short video.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await verificationService.submit(uid, {
        language,
        selfieUri,
        videoUri,
        transcript: script,
      });
      if (error) Alert.alert('Error', error);
      else {
        Alert.alert('Submitted', 'Your verification is submitted. We will review it.');
        setSelfieUri('');
        setVideoUri('');
        refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <HuzzPressable style={styles.headerBtn} onPress={() => onNavigate('myProfile')} haptic="light">
          <Text style={styles.headerBtnText}>← Back</Text>
        </HuzzPressable>
        <Text style={styles.title}>Get Verified</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <View style={styles.box}>
          <Text style={styles.boxTitle}>Status</Text>
          <Text style={styles.boxText}>{latest?.status ? String(latest.status).toUpperCase() : 'NOT SUBMITTED'}</Text>
          {latest?.status === 'rejected' && latest?.decisionNote ? (
            <Text style={styles.boxText}>Note: {String(latest.decisionNote)}</Text>
          ) : null}
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Language</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <HuzzPressable
              style={[styles.pill, language === 'en' ? styles.pillOn : null]}
              onPress={() => setLanguage('en')}
              haptic="light"
            >
              <Text style={styles.pillText}>English</Text>
            </HuzzPressable>
            <HuzzPressable
              style={[styles.pill, language === 'ur' ? styles.pillOn : null]}
              onPress={() => setLanguage('ur')}
              haptic="light"
            >
              <Text style={styles.pillText}>Urdu</Text>
            </HuzzPressable>
          </View>
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Video script</Text>
          <Text style={styles.boxText}>{script}</Text>
        </View>

        <HuzzPressable style={[styles.btn, { backgroundColor: '#87ceeb' }]} onPress={pickSelfie} disabled={loading} haptic="light">
          <Text style={styles.btnText}>{selfieUri ? 'Selfie captured ✓ (retake)' : 'Capture selfie photo'}</Text>
        </HuzzPressable>

        <HuzzPressable style={[styles.btn, { backgroundColor: '#ffb347' }]} onPress={recordVideo} disabled={loading} haptic="light">
          <Text style={styles.btnText}>{videoUri ? 'Video captured ✓ (retake)' : 'Record verification video (≤ 12s)'}</Text>
        </HuzzPressable>

        <HuzzPressable
          style={[styles.btn, { backgroundColor: '#90ee90', borderColor: '#228b22' }]}
          onPress={submit}
          disabled={loading}
          haptic="medium"
        >
          <Text style={styles.btnText}>{loading ? 'Submitting...' : 'Submit for review'}</Text>
        </HuzzPressable>
      </View>
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
    gap: 8,
  },
  boxTitle: { fontSize: 12, fontWeight: '900', color: '#800020', letterSpacing: 1 },
  boxText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#654321',
    backgroundColor: '#ffffff',
  },
  pillOn: { backgroundColor: '#90ee90', borderColor: '#228b22' },
  pillText: { fontWeight: '900', color: '#000000' },
  btn: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#654321',
    backgroundColor: '#c0c0c0',
  },
  btnText: { textAlign: 'center', fontWeight: '900', color: '#000000', textTransform: 'uppercase', letterSpacing: 0.5 },
});

