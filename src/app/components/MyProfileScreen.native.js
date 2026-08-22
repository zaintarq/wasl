import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  Image,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Settings, Images, Sparkles, ShieldCheck, SlidersHorizontal, CircleDot } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { authService, userService, storageService } from '../../services/firebaseService';
import { groupStoriesByUser, listenActiveStories } from '../../services/storyService';
import { StoryManageSheet } from '../../ui/components/discovery/design2/StoryManageSheet.native';
import { COUNTRIES } from '../../utils/countries';
import { sha256 } from '../../utils/hash';
import { FadeInImage } from '../../ui/components/FadeInImage.native';
import { ProfileAboutSection } from '../../ui/components/ProfileAboutSection.native';
import { ProfileVoicePlayer } from '../../ui/components/ProfileVoicePlayer.native';
import { tokens, brandShellGradientSoft } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { RetroButton } from '../../ui/components/RetroButton.native';

const cardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
      }
    : { elevation: 3 };

function normalizePhone(p) {
  return String(p || '').replace(/[^\d+]/g, '');
}

export function MyProfileScreen({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryOfResidence, setCountryOfResidence] = useState('');
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [images, setImages] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);

  const [bio, setBio] = useState('');
  const [interestsText, setInterestsText] = useState('');
  const [addMe, setAddMe] = useState('');
  const [aboutVoiceUrl, setAboutVoiceUrl] = useState('');
  const [aboutVoiceDurationMs, setAboutVoiceDurationMs] = useState(0);
  const [myStories, setMyStories] = useState([]);
  const [storyManageOpen, setStoryManageOpen] = useState(false);

  const uid = authService.getCurrentUser()?.uid || null;
  const [authEmail, setAuthEmail] = useState(authService.getCurrentUser()?.email || '');
  const [emailVerified, setEmailVerified] = useState(!!authService.getCurrentUser()?.emailVerified);
  const displayEmail = authEmail || profile?.email || '';
  const insets = useSafeAreaInsets();

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
        const refresh = await authService.refreshCurrentUser();
        const fresh = refresh?.user || authService.getCurrentUser();
        if (!cancelled && fresh) {
          setAuthEmail(fresh.email || '');
          setEmailVerified(!!fresh.emailVerified);
        }
        const res = await userService.getUserById(u.uid);
        const p = res?.data || null;
        if (!cancelled) {
          setProfile(p);
          setAuthEmail((prev) => fresh?.email || p?.email || prev || '');
          setName(p?.name || u.displayName || '');
          setPhone(p?.phoneLast4 ? String(p.phoneLast4) : '');
          setCountryOfResidence(p?.country || p?.countryOfResidence || '');
          // Filter out invalid image URLs
          const validImages = Array.isArray(p?.images)
            ? p.images.filter((img) => img && typeof img === 'string' && img.trim().length > 0)
            : [];
          setImages(validImages);

          setBio(p?.bio || '');
          setInterestsText(
            Array.isArray(p?.interests) ? p.interests.map((x) => String(x || '').trim()).filter(Boolean).join(', ') : ''
          );
          setAddMe(p?.addMe || '');
          setAboutVoiceUrl(p?.aboutVoiceUrl || '');
          setAboutVoiceDurationMs(typeof p?.aboutVoiceDurationMs === 'number' ? p.aboutVoiceDurationMs : 0);
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

  useEffect(() => {
    if (!uid) return undefined;
    const unsub = listenActiveStories(({ data }) => {
      const groups = groupStoriesByUser(data || []);
      const mine = groups.find((g) => String(g.userId) === String(uid));
      setMyStories(mine?.stories || []);
    });
    return () => unsub && unsub();
  }, [uid]);

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

      updates.bio = String(bio || '').trim().slice(0, 2000);
      updates.interests = String(interestsText || '')
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
      updates.addMe = String(addMe || '').trim().slice(0, 500);
      updates.aboutVoiceUrl = aboutVoiceUrl && String(aboutVoiceUrl).trim() ? String(aboutVoiceUrl).trim() : null;
      updates.aboutVoiceDurationMs =
        updates.aboutVoiceUrl && typeof aboutVoiceDurationMs === 'number' && aboutVoiceDurationMs > 0
          ? Math.min(aboutVoiceDurationMs, 120000)
          : null;

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
    <View style={styles.root}>
      <LinearGradient
        colors={brandShellGradientSoft}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.safe}>
        <View style={[styles.screenHeader, { paddingTop: insets.top }]}>
          <View style={styles.headerRow}>
            <HuzzPressable style={styles.headerSideBtn} onPress={() => onNavigate('home')} haptic="light">
              <ArrowLeft size={22} color={tokens.colors.text} strokeWidth={2.25} />
            </HuzzPressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>My Profile</Text>
            </View>
            <HuzzPressable style={styles.headerSideBtn} onPress={() => onNavigate('settings')} haptic="light">
              <Settings size={22} color={tokens.colors.text} strokeWidth={2.25} />
            </HuzzPressable>
          </View>
        </View>

        <HuzzKeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tokens.spacing.xl + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
        <View style={[styles.card, styles.emailCard, cardShadow]}>
          <Text style={styles.emailLabel}>Your email</Text>
          <Text style={styles.emailValue} selectable>
            {displayEmail || 'No email linked — check Settings or log in with email'}
          </Text>
          <Text style={styles.emailMeta}>
            {emailVerified ? 'Verified' : 'Not verified yet'}
          </Text>
        </View>

        <View style={[styles.card, styles.sectionViolet, cardShadow]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIconWrap, styles.iconWrapViolet]}>
              <Images size={20} color="#6D28D9" strokeWidth={2.2} />
            </View>
            <View style={styles.sectionHeadText}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Photos</Text>
                <HuzzPressable
                  style={styles.previewPill}
                  onPress={() => {
                    setPreviewImageIndex(0);
                    setPreviewOpen(true);
                  }}
                  haptic="light"
                >
                  <Text style={styles.previewPillText}>Preview</Text>
                </HuzzPressable>
              </View>
              <Text style={styles.sectionHint}>Up to 6 photos — your card shows them in discovery</Text>
            </View>
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

        <View style={[styles.card, styles.sectionAmber, cardShadow]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIconWrap, styles.iconWrapAmber]}>
              <CircleDot size={20} color="#B45309" strokeWidth={2.2} />
            </View>
            <View style={styles.sectionHeadText}>
              <Text style={styles.sectionTitle}>Stories</Text>
              <Text style={styles.sectionHint}>
                24h posts · see viewers, hide from people, or delete
              </Text>
            </View>
          </View>
          <Text style={styles.mutedLine}>
            Active stories: {myStories.length}
          </Text>
          <RetroButton
            variant="outline"
            title="Manage story privacy"
            onPress={() => setStoryManageOpen(true)}
            style={styles.fullBtn}
          />
        </View>

        <View style={[styles.card, styles.sectionEmerald, cardShadow]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIconWrap, styles.iconWrapEmerald]}>
              <Sparkles size={20} color="#047857" strokeWidth={2.2} />
            </View>
            <View style={styles.sectionHeadText}>
              <Text style={styles.sectionTitle}>About you</Text>
              <Text style={styles.sectionHint}>
                Bio, interests, socials, voice — all optional. Free AI tools can help you write your bio.
              </Text>
            </View>
          </View>
          <ProfileAboutSection
            showHeading={false}
            bio={bio}
            onChangeBio={setBio}
            interestsText={interestsText}
            onChangeInterestsText={setInterestsText}
            addMe={addMe}
            onChangeAddMe={setAddMe}
            aboutVoiceUrl={aboutVoiceUrl}
            onChangeAboutVoiceUrl={setAboutVoiceUrl}
            aboutVoiceDurationMs={aboutVoiceDurationMs}
            onChangeAboutVoiceDurationMs={setAboutVoiceDurationMs}
            uid={uid}
          />
        </View>

        <View style={[styles.card, styles.sectionRose, cardShadow]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIconWrap, styles.iconWrapRose]}>
              <ShieldCheck size={20} color="#E11D48" strokeWidth={2.2} />
            </View>
            <View style={styles.sectionHeadText}>
              <Text style={styles.sectionTitle}>Account</Text>
              <Text style={styles.sectionHint}>Email, verification, HUZZ badge</Text>
            </View>
          </View>
          <Text style={styles.fieldLabel}>Email</Text>
          <Text style={styles.emailField} selectable>
            {displayEmail || '—'}
          </Text>
          <Text style={styles.mutedLine}>Email verified: {emailVerified ? 'Yes' : 'No'}</Text>
          <Text style={styles.mutedLine}>HUZZ badge: {profile?.isVerified ? 'Verified' : 'Not verified'}</Text>
          <View style={styles.btnStack}>
            <RetroButton variant="green" title="Get verified badge" onPress={() => onNavigate('verification')} style={styles.fullBtn} />
            {!emailVerified && (
              <RetroButton
                variant="primary"
                title="Resend verification email"
                onPress={async () => {
                  const { error } = await authService.resendVerificationEmail();
                  if (error) Alert.alert('Error', error);
                  else Alert.alert('Sent', 'Verification email resent.');
                }}
                style={styles.fullBtn}
              />
            )}
          </View>
        </View>

        <View style={[styles.card, styles.sectionSky, cardShadow]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIconWrap, styles.iconWrapSky]}>
              <SlidersHorizontal size={20} color="#0369A1" strokeWidth={2.2} />
            </View>
            <View style={styles.sectionHeadText}>
              <Text style={styles.sectionTitle}>Preferences</Text>
              <Text style={styles.sectionHint}>Name, phone, country</Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput style={styles.fieldInput} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={tokens.colors.textMuted} />

          <Text style={styles.fieldLabel}>Phone (optional for contacts blocking)</Text>
          <TextInput
            style={styles.fieldInput}
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 555 123 4567"
            keyboardType="phone-pad"
            placeholderTextColor={tokens.colors.textMuted}
          />

          <Text style={styles.fieldLabel}>Your country</Text>
          <HuzzPressable style={styles.fieldInputTouchable} onPress={() => setCountryModalOpen(true)} haptic="light">
            <Text style={styles.fieldInputTouchableText}>
              {countryOfResidence ? countryOfResidence : 'Select country'}
            </Text>
          </HuzzPressable>
        </View>

        <RetroButton
          variant="primary"
          title={saving ? 'Saving…' : 'Save profile'}
          onPress={save}
          disabled={loading || saving}
          style={styles.fullBtn}
        />
      </HuzzKeyboardAwareScrollView>

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
            <RetroButton variant="gray" title="Close" onPress={() => setCountryModalOpen(false)} style={styles.fullBtn} />
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

                {/* About, Add me, Interests, Voice — mirrors swipe card (draft state) */}
                <ScrollView style={styles.previewBioContainer} contentContainerStyle={{ paddingBottom: 20 }}>
                  {!!String(bio || '').trim() && (
                    <>
                      <Text style={styles.previewSectionLabel}>About</Text>
                      <Text style={styles.previewBio}>{String(bio || '').trim()}</Text>
                    </>
                  )}
                  {!!String(addMe || '').trim() && (
                    <>
                      <Text style={[styles.previewSectionLabel, { marginTop: 12 }]}>Add me</Text>
                      <Text style={styles.previewAddMe}>{String(addMe || '').trim()}</Text>
                    </>
                  )}
                  {(() => {
                    const previewInterests = String(interestsText || '')
                      .split(/[,\n]/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .slice(0, 20);
                    if (!previewInterests.length) return null;
                    return (
                      <>
                        <Text style={[styles.previewSectionLabel, { marginTop: 12 }]}>Interests</Text>
                        <View style={styles.previewInterestsContainer}>
                          {previewInterests.map((interest, idx) => {
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
                      </>
                    );
                  })()}
                  {aboutVoiceUrl && String(aboutVoiceUrl).trim() ? (
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.previewSectionLabel}>Voice</Text>
                      <ProfileVoicePlayer audioUrl={aboutVoiceUrl.trim()} durationMs={aboutVoiceDurationMs} />
                    </View>
                  ) : null}
                </ScrollView>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      <StoryManageSheet
        visible={storyManageOpen}
        onClose={() => setStoryManageOpen(false)}
        authorUid={uid}
        activeStoryId={myStories[myStories.length - 1]?.id || null}
        myStories={myStories}
        onStoriesChanged={() => {
          /* stories list updates via live listener */
        }}
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.filterBgRose,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  screenHeader: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
    paddingHorizontal: tokens.spacing.sm,
    paddingBottom: tokens.spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  headerSideBtn: {
    minWidth: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.colors.text,
    letterSpacing: -0.3,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  card: {
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapViolet: { backgroundColor: 'rgba(139, 92, 246, 0.22)' },
  iconWrapEmerald: { backgroundColor: 'rgba(16, 185, 129, 0.22)' },
  iconWrapRose: { backgroundColor: 'rgba(225, 29, 72, 0.18)' },
  iconWrapSky: { backgroundColor: 'rgba(14, 165, 233, 0.2)' },
  iconWrapAmber: { backgroundColor: 'rgba(245, 158, 11, 0.22)' },
  sectionAmber: {
    backgroundColor: 'rgba(255, 251, 235, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  sectionHeadText: {
    flex: 1,
    justifyContent: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.colors.text,
    letterSpacing: -0.2,
    flex: 1,
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  sectionViolet: {
    backgroundColor: tokens.colors.filterBgViolet,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderViolet,
  },
  sectionEmerald: {
    backgroundColor: tokens.colors.filterBgEmerald,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderEmerald,
  },
  sectionRose: {
    backgroundColor: tokens.colors.filterBgRose,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderRose,
  },
  sectionSky: {
    backgroundColor: tokens.colors.filterBgSky,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderSky,
  },
  previewPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.full,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  previewPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.accent,
  },
  mutedLine: {
    fontSize: 14,
    color: tokens.colors.textSecondary,
    marginBottom: 6,
  },
  emailCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    marginBottom: 12,
  },
  emailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  emailValue: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.colors.text,
    marginBottom: 4,
  },
  emailMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colors.brandPinkDeep,
  },
  emailField: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
    color: tokens.colors.text,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colors.text,
    marginTop: 10,
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: tokens.colors.text,
  },
  fieldInputTouchable: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  fieldInputTouchableText: {
    fontSize: 16,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  btnStack: { gap: 10 },
  fullBtn: { alignSelf: 'stretch', width: '100%' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: tokens.spacing.md,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.colors.text,
    marginBottom: 12,
  },
  modalSearch: {
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: 12,
    fontSize: 16,
    color: tokens.colors.text,
    marginBottom: 12,
  },
  modalRow: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  modalRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  modalRowSelected: {
    backgroundColor: tokens.colors.accentDim,
    borderColor: tokens.colors.accent,
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
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.colors.border,
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
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderStyle: 'dashed',
    backgroundColor: tokens.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    fontSize: 28,
    fontWeight: '700',
    color: tokens.colors.accent,
  },
  photoHint: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    padding: 16,
  },
  previewContainer: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    maxHeight: '85%',
    flex: 1,
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  previewTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.colors.text,
    letterSpacing: -0.2,
  },
  previewCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  previewCloseText: {
    color: tokens.colors.textSecondary,
    fontSize: 18,
    fontWeight: '600',
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
    height: '62%',
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
    height: '38%',
    backgroundColor: '#ffe4e1',
    padding: 12,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  previewSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#654321',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewBio: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '900',
    marginBottom: 4,
    lineHeight: 18,
  },
  previewAddMe: {
    fontSize: 12,
    color: '#333333',
    fontWeight: '600',
    lineHeight: 18,
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
});


