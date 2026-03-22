import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Alert, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { authService, userService, storageService } from '../../services/firebaseService';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';

const COL = { users: 'users' };
import { COUNTRIES } from '../../utils/countries';
import { sha256 } from '../../utils/hash';
import { INTENTS } from '../../utils/intents';
import { FadeInImage } from '../../ui/components/FadeInImage.native';

function normalizePhone(p) {
  return String(p || '').replace(/[^\d+]/g, '');
}

export function MyProfileScreen({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [categoryIntent, setCategoryIntent] = useState('');
  const [intentModalOpen, setIntentModalOpen] = useState(false);
  const [countryOfResidence, setCountryOfResidence] = useState('');
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [images, setImages] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  
  // Wali settings
  const [waliName, setWaliName] = useState('');
  const [waliEmail, setWaliEmail] = useState('');
  const [waliVisibility, setWaliVisibility] = useState('hidden');
  const [waliConsentLevel, setWaliConsentLevel] = useState('ask');
  const [waliInviteSent, setWaliInviteSent] = useState(false);

  const uid = authService.getCurrentUser()?.uid || null;
  const email = authService.getCurrentUser()?.email || '';
  const emailVerified = !!authService.getCurrentUser()?.emailVerified;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const u = authService.getCurrentUser();
        if (!u) {
          onNavigate('onboarding', { mode: 'login' });
          return;
        }
        const res = await userService.getUserById(u.uid);
        const p = res?.data || null;
        if (!cancelled) {
          setProfile(p);
          setName(p?.name || u.displayName || '');
          setPhone(p?.phoneLast4 ? String(p.phoneLast4) : '');
          setCategoryIntent(String(p?.categoryIntent || '').trim());
          setCountryOfResidence(p?.country || p?.countryOfResidence || '');
          // Filter out invalid image URLs
          const validImages = Array.isArray(p?.images)
            ? p.images.filter((img) => img && typeof img === 'string' && img.trim().length > 0)
            : [];
          setImages(validImages);
          
          // Load wali settings
          if (p?.wali) {
            setWaliName(p.wali.name || '');
            setWaliEmail(p.wali.email || '');
            setWaliVisibility(p.wali.visibility || 'hidden');
            setWaliConsentLevel(p.wali.consentLevel || 'ask');
            setWaliInviteSent(p.wali.inviteSent || false);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [onNavigate]);

  const save = async () => {
    if (!uid) {
      Alert.alert('Error', 'You must be logged in to update your profile.');
      return;
    }
    if (!countryOfResidence.trim()) {
      Alert.alert('Missing info', 'Please select your country.');
      return;
    }
    setSaving(true);
    try {
      const phoneNorm = normalizePhone(phone);
      const updates = {
        name: name.trim(),
        categoryIntent: String(categoryIntent || '').trim(),
        country: countryOfResidence.trim(),
        countryOfResidence: countryOfResidence.trim(), // legacy compat
        // Default discovery to user's country if not already set
        matchCountry: (profile?.matchCountry || '').trim() || countryOfResidence.trim(),
      };

      // Optional: phone-based contact blocking.
      // We store only a hash (no raw number) and a last4 helper for UI.
      if (phoneNorm) {
        updates.phoneHash = await sha256(phoneNorm);
        updates.phoneLast4 = phoneNorm.slice(-4);
      }
      // Update images array
      updates.images = images;

      // Update wali settings if provided
      if (waliName.trim() || waliEmail.trim()) {
        const waliEmailNorm = String(waliEmail || '').trim().toLowerCase();
        const isNewWali = !profile?.wali?.email || profile.wali.email !== waliEmailNorm;
        
        // Generate unique hash for wali login (32 characters for better security)
        let waliHash = profile?.wali?.hash;
        if (isNewWali || !waliHash) {
          // Generate a unique hash: userId + email + timestamp + random
          const randomSuffix = Math.random().toString(36).substring(2, 10);
          const hashInput = `${uid}_${waliEmailNorm}_${Date.now()}_${randomSuffix}`;
          waliHash = await sha256(hashInput);
          // Use full 32 characters for better security
          waliHash = waliHash.substring(0, 32).toUpperCase();
        }
        
        updates.wali = {
          name: waliName.trim(),
          email: waliEmailNorm,
          emailHash: waliEmailNorm ? await sha256(waliEmailNorm) : '',
          hash: waliHash, // Store hash for login
          visibility: waliVisibility,
          consentLevel: waliConsentLevel,
          addedAt: profile?.wali?.addedAt || new Date(),
          inviteSent: profile?.wali?.inviteSent || false,
        };
        
        // Send invitation email if this is a new wali email
        if (isNewWali && waliEmailNorm) {
          try {
            const { error: emailError } = await userService.sendWaliInvitation(uid, {
              waliName: waliName.trim(),
              waliEmail: waliEmailNorm,
              userName: name || email,
              waliHash: waliHash,
              senderEmail: email || '', // Include sender's email
              senderName: name || email || 'Someone', // Include sender's name
            });
            if (!emailError) {
              updates.wali.inviteSent = true;
              setWaliInviteSent(true);
              Alert.alert('Invitation Sent', 'Your wali will receive an email with a login hash.');
            } else {
              console.warn('[MyProfile] Failed to send wali invitation:', emailError);
              Alert.alert('Warning', 'Profile saved but invitation email failed. Please try again later.');
            }
          } catch (e) {
            console.warn('[MyProfile] Error sending wali invitation:', e);
          }
        }
        
        // Mark prompt as shown when wali is added
        updates.waliSetupPromptShown = true;
      } else if (profile?.wali?.name || profile?.wali?.email) {
        // Remove wali if fields are cleared - also invalidate wali sessions
        const oldWaliHash = profile?.wali?.hash;
        updates.wali = null;
        
        // Invalidate wali user session by finding and marking wali user as removed
        if (oldWaliHash) {
          try {
            // Find wali user by hash and mark as removed
            const waliUserQuery = query(
              collection(db, COL.users),
              where('waliHash', '==', oldWaliHash),
              where('role', '==', 'wali')
            );
            const waliUserSnap = await getDocs(waliUserQuery);
            if (!waliUserSnap.empty) {
              const waliUserDoc = waliUserSnap.docs[0];
              await updateDoc(doc(db, COL.users, waliUserDoc.id), {
                waliRemoved: true,
                waliRemovedAt: serverTimestamp(),
              });
            }
          } catch (e) {
            console.warn('[MyProfile] Error invalidating wali session:', e);
          }
        }
      }

      const { error } = await userService.updateUser(uid, {
        ...updates,
      });
      if (error) Alert.alert('Error', error);
      else Alert.alert('Saved', 'Profile updated.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => onNavigate('home')}>
          <Text style={styles.headerBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Profile</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => onNavigate('settings')}>
          <Text style={styles.headerBtnText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={styles.box}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={styles.boxTitle}>Photos</Text>
            <TouchableOpacity
              style={styles.previewBtn}
              onPress={() => {
                setPreviewImageIndex(0);
                setPreviewOpen(true);
              }}
            >
              <Text style={styles.previewBtnText}>👁️ Preview</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.photoGrid}>
            {images
              .filter((img) => img && typeof img === 'string' && img.trim().length > 0)
              .map((img, idx) => (
                <View key={idx} style={styles.photoItem}>
                  <Image source={{ uri: String(img) }} style={styles.photo} />
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => {
                      Alert.alert('Remove photo?', 'Are you sure?', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => {
                            const filtered = images.filter((_, i) => i !== idx);
                            setImages(filtered);
                          },
                        },
                      ]);
                    }}
                  >
                    <Text style={styles.removePhotoText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            {images.length < 6 && (
              <TouchableOpacity
                style={styles.addPhotoBtn}
                onPress={async () => {
                  try {
                    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (perm.status !== 'granted') {
                      Alert.alert('Permission needed', 'Please allow photo access.');
                      return;
                    }
                    // Handle different expo-image-picker API versions
                    // Try to use MediaType.Images (array format), fallback to omitting if not available
                    let mediaTypesOption = undefined;
                    try {
                      if (ImagePicker.MediaType?.Images) {
                        mediaTypesOption = [ImagePicker.MediaType.Images];
                      } else if (ImagePicker.MediaType?.Images) {
                        mediaTypesOption = [ImagePicker.MediaType.Images];
                      }
                    } catch (e) {
                      // MediaType not available, will use default (images)
                      console.warn('[MyProfile] MediaType not available, using default');
                    }
                    
                    const result = await ImagePicker.launchImageLibraryAsync({
                      ...(mediaTypesOption ? { mediaTypes: mediaTypesOption } : {}),
                      allowsEditing: true,
                      aspect: [4, 5],
                      quality: 0.7,
                    });
                    if (!result.canceled && result.assets[0]) {
                      setUploadingImage(true);
                      try {
                        const { url, error } = await storageService.uploadImage(uid, result.assets[0].uri);
                        if (url && typeof url === 'string' && url.trim().length > 0) {
                          setImages([...images, url]);
                          Alert.alert('Success', 'Photo added!');
                        } else {
                          Alert.alert('Error', error || 'Failed to upload. No URL returned.');
                        }
                      } catch (e) {
                        console.error('[MyProfile] Upload error:', e);
                        Alert.alert('Error', e?.message || 'Failed to upload image.');
                      } finally {
                        setUploadingImage(false);
                      }
                    }
                  } catch (e) {
                    setUploadingImage(false);
                    Alert.alert('Error', e?.message || 'Failed to pick image.');
                  }
                }}
                disabled={uploadingImage}
              >
                <Text style={styles.addPhotoText}>{uploadingImage ? '...' : '+'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.photoHint}>{images.length}/6 photos</Text>
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Account</Text>
          <Text style={styles.boxText}>Email: {email || '-'}</Text>
          <Text style={styles.boxText}>Verified: {emailVerified ? 'Yes' : 'No'}</Text>
          <Text style={styles.boxText}>HUZZ badge: {profile?.isVerified ? '✅ Verified' : 'Not verified'}</Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#ffd700' }]}
            onPress={() => onNavigate('verification')}
          >
            <Text style={styles.btnText}>Get verified badge</Text>
          </TouchableOpacity>
          {!emailVerified && (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#87ceeb', borderColor: '#4682b4' }]}
              onPress={async () => {
                const { error } = await authService.resendVerificationEmail();
                if (error) Alert.alert('Error', error);
                else Alert.alert('Sent', 'Verification email resent.');
              }}
            >
              <Text style={styles.btnText}>Resend verification</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Preferences</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" />

          <Text style={styles.label}>Phone (optional for contacts blocking)</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 555 123 4567"
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>My intent</Text>
          <TouchableOpacity style={[styles.input, { justifyContent: 'center' }]} onPress={() => setIntentModalOpen(true)}>
            <Text style={{ fontWeight: '800', color: '#000000' }}>{categoryIntent || 'Select intent'}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Your country</Text>
          <TouchableOpacity
            style={[styles.input, { justifyContent: 'center' }]}
            onPress={() => setCountryModalOpen(true)}
          >
            <Text style={{ fontWeight: '800', color: '#000000' }}>
              {countryOfResidence ? countryOfResidence : 'Select country'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Wali/Guardian Settings */}
        <View style={styles.box}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Text style={styles.boxTitle}>Wali/Guardian Settings</Text>
            <Text style={styles.infoIcon}>ℹ️</Text>
          </View>
          <Text style={styles.boxText}>
            Add a guardian (wali) who can help oversee your matches and conversations with your consent.
          </Text>

          <Text style={styles.label}>Wali Name</Text>
          <TextInput
            style={styles.input}
            value={waliName}
            onChangeText={setWaliName}
            placeholder="Guardian's name"
          />

          <Text style={styles.label}>Wali Email</Text>
          <TextInput
            style={styles.input}
            value={waliEmail}
            onChangeText={setWaliEmail}
            placeholder="guardian@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Show on Profile</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <TouchableOpacity
              style={[
                styles.radioOption,
                waliVisibility === 'visible' && styles.radioOptionSelected,
              ]}
              onPress={() => setWaliVisibility('visible')}
            >
              <Text style={[styles.radioText, waliVisibility === 'visible' && styles.radioTextSelected]}>
                Show
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.radioOption,
                waliVisibility === 'hidden' && styles.radioOptionSelected,
              ]}
              onPress={() => setWaliVisibility('hidden')}
            >
              <Text style={[styles.radioText, waliVisibility === 'hidden' && styles.radioTextSelected]}>
                Hide
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>When Can Wali Step In?</Text>
          <TouchableOpacity
            style={[styles.input, { justifyContent: 'center' }]}
            onPress={() => {
              Alert.alert(
                'Consent Level',
                'Choose when your wali can access your matches:',
                [
                  { text: 'Always', onPress: () => setWaliConsentLevel('always') },
                  { text: 'Ask Me Each Time', onPress: () => setWaliConsentLevel('ask') },
                  { text: 'Never', onPress: () => setWaliConsentLevel('never') },
                  { text: 'Cancel', style: 'cancel' },
                ]
              );
            }}
          >
            <Text style={{ fontWeight: '800', color: '#000000' }}>
              {waliConsentLevel === 'always' ? 'Always' : waliConsentLevel === 'ask' ? 'Ask Me Each Time' : 'Never'}
            </Text>
          </TouchableOpacity>

          {waliInviteSent && (
            <View style={{ marginTop: 8, padding: 8, backgroundColor: '#90ee90', borderRadius: 8, borderWidth: 2, borderColor: '#228b22' }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#000000' }}>✓ Invitation Email Sent</Text>
            </View>
          )}

          {profile?.wali?.name && (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#ff6b6b', marginTop: 12 }]}
              onPress={async () => {
                Alert.alert('Remove Wali?', 'Are you sure you want to remove your wali?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                      setWaliName('');
                      setWaliEmail('');
                      setWaliVisibility('hidden');
                      setWaliConsentLevel('ask');
                      setWaliInviteSent(false);
                      await userService.updateUser(uid, { wali: null });
                      Alert.alert('Removed', 'Wali has been removed.');
                    },
                  },
                ]);
              }}
            >
              <Text style={[styles.btnText, { color: '#ffffff' }]}>Remove Wali</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#800020' }]}
          onPress={save}
          disabled={loading || saving}
        >
          <Text style={[styles.btnText, { color: '#ffffff' }]}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Country dropdown modal */}
      <Modal visible={countryModalOpen} animationType="slide" transparent onRequestClose={() => setCountryModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select country</Text>
            <TextInput
              style={styles.modalSearch}
              placeholder="Search country..."
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoCapitalize="none"
            />
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 8 }}>
              {COUNTRIES.filter((c) => c.toLowerCase().includes(String(countrySearch || '').trim().toLowerCase())).map((c) => (
                <TouchableOpacity
                  key={c}
                  style={styles.modalRow}
                  onPress={() => {
                    setCountryOfResidence(c);
                    setCountryModalOpen(false);
                    setCountrySearch('');
                  }}
                >
                  <Text style={styles.modalRowText}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#c0c0c0' }]} onPress={() => setCountryModalOpen(false)}>
              <Text style={styles.btnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Intent dropdown modal */}
      <Modal visible={intentModalOpen} animationType="slide" transparent onRequestClose={() => setIntentModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select intent</Text>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 8 }}>
              {INTENTS.map((it) => (
                <TouchableOpacity
                  key={it}
                  style={[
                    styles.modalRow,
                    categoryIntent === it ? { backgroundColor: '#90ee90', borderColor: '#228b22' } : null,
                  ]}
                  onPress={() => {
                    setCategoryIntent(it);
                    setIntentModalOpen(false);
                  }}
                >
                  <Text style={styles.modalRowText}>
                    {it}
                    {categoryIntent === it ? ' ✓' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.modalRow}
                onPress={() => {
                  setCategoryIntent('');
                  setIntentModalOpen(false);
                }}
              >
                <Text style={styles.modalRowText}>No preference</Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#c0c0c0' }]} onPress={() => setIntentModalOpen(false)}>
              <Text style={styles.btnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Profile Preview Modal */}
      <Modal visible={previewOpen} animationType="slide" transparent onRequestClose={() => setPreviewOpen(false)}>
        <SafeAreaView style={styles.previewBackdrop} edges={['top', 'bottom']}>
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Profile Preview</Text>
              <TouchableOpacity onPress={() => setPreviewOpen(false)} style={styles.previewCloseBtn}>
                <Text style={styles.previewCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.previewScrollContent}>
              {/* Profile Card - EXACTLY like HomeScreen swipe deck */}
              <View style={styles.previewCard}>
                {/* Image */}
                <View style={styles.previewImageContainer}>
                  {images.length > 0 ? (
                    <>
                      <FadeInImage
                        source={{ uri: String(images[previewImageIndex] || '') }}
                        style={styles.previewImage}
                        resizeMode="cover"
                        contentPosition="top"
                      />

                      {/* Candidate intent pill */}
                      {!!String(categoryIntent || '').trim() && (
                        <View style={styles.previewCandidateIntentPill}>
                          <Text style={styles.previewCandidateIntentText}>{String(categoryIntent || '').trim()}</Text>
                        </View>
                      )}

                      {/* Image Navigation */}
                      {images.length > 1 && (
                        <>
                          <TouchableOpacity
                            style={[styles.previewNavBtn, styles.previewNavLeft]}
                            onPress={() => setPreviewImageIndex(Math.max(0, previewImageIndex - 1))}
                          >
                            <Text style={styles.previewNavText}>‹</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.previewNavBtn, styles.previewNavRight]}
                            onPress={() => setPreviewImageIndex(Math.min(images.length - 1, previewImageIndex + 1))}
                          >
                            <Text style={styles.previewNavText}>›</Text>
                          </TouchableOpacity>
                        </>
                      )}

                      {/* Overlay */}
                      <View style={styles.previewOverlay}>
                        <View style={styles.previewUserInfo}>
                          <View style={styles.previewNameRow}>
                            <Text style={styles.previewUserName}>{name || 'User'}</Text>
                            {profile?.isVerified ? <Text style={styles.previewVerifiedBadge}> ✅</Text> : null}
                            {profile?.age ? <Text style={styles.previewUserAge}> {profile.age}</Text> : null}
                          </View>
                          <Text style={styles.previewLocation}>
                            📍 {countryOfResidence || 'Your Location'}
                          </Text>
                        </View>
                      </View>
                    </>
                  ) : (
                    <View style={styles.previewImagePlaceholder}>
                      <Text style={styles.previewImagePlaceholderText}>No photos yet</Text>
                    </View>
                  )}
                </View>

                {/* Bio & Interests */}
                <ScrollView style={styles.previewBioContainer} contentContainerStyle={{ paddingBottom: 20 }}>
                  <Text style={styles.previewBio}>{String(profile?.bio || '')}</Text>
                  <View style={styles.previewInterestsContainer}>
                    {(profile?.interests || []).slice(0, 4).map((interest, idx) => {
                      const colors = ['#98fb98', '#b0e0e6', '#fffacd', '#f0e68c'];
                      return (
                        <View
                          key={`${interest}-${idx}`}
                          style={[styles.previewInterestTag, { backgroundColor: colors[idx % colors.length] }]}
                        >
                          <Text style={styles.previewInterestTagText}>{interest}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
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
    minWidth: 60,
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
  boxTitle: { fontSize: 12, fontWeight: '900', color: '#800020', letterSpacing: 1, marginBottom: 10 },
  boxText: { fontSize: 12, fontWeight: 'bold', color: '#000000', marginBottom: 6 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#000000', marginTop: 8, marginBottom: 6 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#8b4513',
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#000000',
  },
  btn: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#654321',
    backgroundColor: '#c0c0c0',
  },
  btnText: { textAlign: 'center', fontWeight: '900', color: '#000000', textTransform: 'uppercase', letterSpacing: 0.5 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 4,
    borderColor: '#8b4513',
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#8b4513',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalSearch: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#8b4513',
    padding: 12,
    fontSize: 14,
    color: '#000000',
    marginBottom: 12,
  },
  modalRow: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#654321',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  modalRowText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  photoItem: {
    width: '31%',
    aspectRatio: 4 / 5,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#8b4513',
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  addPhotoBtn: {
    width: '31%',
    aspectRatio: 4 / 5,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#8b4513',
    borderStyle: 'dashed',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#8b4513',
  },
  photoHint: {
    fontSize: 11,
    fontWeight: '800',
    color: '#654321',
    marginTop: 4,
    textAlign: 'center',
  },
  previewBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: '#8b4513',
    borderRadius: 8,
    backgroundColor: '#fffef0',
  },
  previewBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#800020',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    padding: 16,
  },
  previewContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#8b4513',
    maxHeight: '85%',
    flex: 1,
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 3,
    borderBottomColor: '#8b4513',
    backgroundColor: '#fffef0',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#8b4513',
    letterSpacing: 1,
  },
  previewCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#800020',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#654321',
  },
  previewCloseText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  previewScrollContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  previewCard: {
    width: '100%',
    maxWidth: 440,
    height: 700,
    backgroundColor: '#fffef0',
    borderRadius: 40,
    borderWidth: 5,
    borderColor: '#654321',
    overflow: 'hidden',
    shadowColor: '#654321',
    shadowOffset: { width: 8, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 15,
    alignSelf: 'center',
  },
  previewImageContainer: {
    height: '74%',
    position: 'relative',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#d3d3d3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImagePlaceholderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#654321',
  },
  previewCandidateIntentPill: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#654321',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  previewCandidateIntentText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#000000',
  },
  previewNavBtn: {
    position: 'absolute',
    top: '50%',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    zIndex: 10,
  },
  previewNavLeft: {
    left: 16,
  },
  previewNavRight: {
    right: 16,
  },
  previewNavText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(139, 69, 19, 0.95)',
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 16,
    minHeight: 74,
  },
  previewUserInfo: {
    gap: 8,
  },
  previewNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    flexWrap: 'wrap',
  },
  previewUserName: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffd700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: '#000000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
    lineHeight: 30,
  },
  previewUserAge: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    lineHeight: 22,
  },
  previewVerifiedBadge: {
    fontSize: 14,
    fontWeight: '900',
    color: '#90ee90',
  },
  previewLocation: {
    fontSize: 11,
    color: '#ffffff',
    lineHeight: 15,
  },
  previewBioContainer: {
    height: '26%',
    backgroundColor: '#ffe4e1',
    padding: 12,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  previewBio: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '900',
    marginBottom: 12,
  },
  previewInterestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewInterestTag: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#654321',
    shadowColor: '#654321',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  previewInterestTagText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000000',
  },
  infoIcon: {
    fontSize: 14,
    fontWeight: '900',
  },
  radioOption: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#8b4513',
    backgroundColor: '#ffffff',
  },
  radioOptionSelected: {
    backgroundColor: '#800020',
    borderColor: '#654321',
  },
  radioText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
  },
  radioTextSelected: {
    color: '#ffffff',
  },
});


