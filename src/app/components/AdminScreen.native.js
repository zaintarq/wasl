import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { tokens } from '../../ui/tokens';
import { adminService, authService, deviceBanService, userService, verificationService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ArrowLeft, Settings } from 'lucide-react-native';
import { useFonts, KaushanScript_400Regular } from '@expo-google-fonts/kaushan-script';

const cardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
      }
    : { elevation: 3 };

export function AdminScreen({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reports, setReports] = useState([]);
  const [verifs, setVerifs] = useState([]);
  const [tab, setTab] = useState('reports'); // 'reports' | 'safety' | 'verifications' | 'users' | 'vulgar'
  const [vulgarAttempts, setVulgarAttempts] = useState([]);
  const [vulgarLoading, setVulgarLoading] = useState(false);
  const [safetyProfiles, setSafetyProfiles] = useState([]);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [selectedSafetyProfile, setSelectedSafetyProfile] = useState(null);
  const [selectedSafetyEvents, setSelectedSafetyEvents] = useState([]);
  const [selectedSafetyReports, setSelectedSafetyReports] = useState([]);
  const [selectedSafetyAttempts, setSelectedSafetyAttempts] = useState([]);
  const [safetyDetailLoading, setSafetyDetailLoading] = useState(false);
  const [safetyNotesDraft, setSafetyNotesDraft] = useState('');
  const [savingSafetyProfile, setSavingSafetyProfile] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createUserEmail, setCreateUserEmail] = useState('');
  const [createUserPassword, setCreateUserPassword] = useState('');
  const [createUserName, setCreateUserName] = useState('');
  const [createUserRole, setCreateUserRole] = useState('user'); // 'user' | 'staff'
  const [creatingUser, setCreatingUser] = useState(false);
  const [fontsLoaded] = useFonts({ KaushanScript_400Regular });
  const insets = useSafeAreaInsets();

  const refreshVulgarAttempts = async () => {
    setVulgarLoading(true);
    try {
      const res = await adminService.listVulgarAttempts({ limitCount: 100 });
      setVulgarAttempts(res?.data || []);
    } finally {
      setVulgarLoading(false);
    }
  };

  const loadSafetyProfiles = async () => {
    setSafetyLoading(true);
    try {
      const res = await adminService.listUserSafetyProfiles({ limitCount: 100 });
      setSafetyProfiles(res?.data || []);
    } catch (error) {
      console.error('[AdminScreen] Safety profiles error:', error);
      setSafetyProfiles([]);
    } finally {
      setSafetyLoading(false);
    }
  };

  const openSafetyProfile = async (uid) => {
    if (!uid) return;
    setSafetyDetailLoading(true);
    try {
      const res = await adminService.getUserSafetyProfile(uid, { limitCount: 40 });
      const detail = res?.data || null;
      setSelectedSafetyProfile(detail?.profile || null);
      setSelectedSafetyEvents(detail?.events || []);
      setSelectedSafetyReports(detail?.reports || []);
      setSelectedSafetyAttempts(detail?.vulgarAttempts || []);
      setSafetyNotesDraft(String(detail?.profile?.adminNotes || ''));
    } catch (error) {
      console.error('[AdminScreen] Safety detail error:', error);
      Alert.alert('Error', error?.message || 'Failed to load safety profile.');
    } finally {
      setSafetyDetailLoading(false);
    }
  };

  const saveSafetyProfile = async () => {
    if (!selectedSafetyProfile?.uid) return;
    setSavingSafetyProfile(true);
    try {
      const { error } = await adminService.updateUserSafetyProfile(selectedSafetyProfile.uid, {
        adminStatus: selectedSafetyProfile.adminStatus || selectedSafetyProfile.riskLevel || 'clear',
        adminNotes: safetyNotesDraft,
      });
      if (error) {
        Alert.alert('Error', error);
        return;
      }
      await Promise.all([loadSafetyProfiles(), openSafetyProfile(selectedSafetyProfile.uid)]);
      Alert.alert('Saved', 'Safety notes updated.');
    } finally {
      setSavingSafetyProfile(false);
    }
  };

  const load = async (retryCount = 0) => {
    setLoading(true);
    try {
      const uid = authService.getCurrentUser()?.uid;
      if (!uid) {
        console.log('[AdminScreen] No UID, redirecting to login');
        onNavigate('onboarding', { mode: 'login' });
        return;
      }
      console.log('[AdminScreen] Loading user profile for UID:', uid, retryCount > 0 ? `(retry ${retryCount})` : '');
      
      // Check role from admin collection
      const roleCheck = await checkUserRoleFromAdminCollection(uid);
      console.log('[AdminScreen] Role check from admin collection:', roleCheck);
      
      if (!roleCheck.isAdmin) {
        console.log('[AdminScreen] User is not admin. isAdmin:', roleCheck.isAdmin, 'role:', roleCheck.role);
        setIsAdmin(false);
        setReports([]);
        setVerifs([]);
        return;
      }
      console.log('[AdminScreen] Admin confirmed, loading reports and verifications');
      setIsAdmin(true);
      const [res, vres, safetyRes] = await Promise.all([
        adminService.listReports({ status: 'open', limitCount: 50 }),
        verificationService.list({ status: 'submitted', limitCount: 50 }),
        adminService.listUserSafetyProfiles({ limitCount: 100 }),
      ]);
      setReports(res?.data || []);
      setVerifs(vres?.data || []);
      setSafetyProfiles(safetyRes?.data || []);
    } catch (error) {
      console.error('[AdminScreen] Load error:', error);
      // If error and first attempt, retry once
      if (retryCount === 0) {
        console.log('[AdminScreen] Error on first attempt, retrying...');
        return load(1);
      }
      Alert.alert('Error', `Failed to load admin data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;

    const setupListener = () => {
      const uid = authService.getCurrentUser()?.uid;
      if (!uid) {
        if (!cancelled) load();
        return;
      }

      // Use real-time listener for immediate role detection - no delays!
      // Use admin collection for real-time role detection
      const adminRef = doc(db, 'admin', uid);
      
      unsubscribe = onSnapshot(
        adminRef,
        (snap) => {
          if (cancelled) return;
          
          if (!snap.exists()) {
            console.log('[AdminScreen] Admin document does not exist - user is not admin');
            setIsAdmin(false);
            setReports([]);
            setVerifs([]);
            setLoading(false);
            return;
          }

          const data = snap.data();
          const role = String(data?.role || '').toLowerCase().trim();
          const isAdmin = role === 'admin';
          console.log('[AdminScreen] Real-time role check from admin collection:', role, 'isAdmin:', isAdmin);

          if (isAdmin) {
            console.log('[AdminScreen] ✅ Admin role confirmed via real-time listener');
            setIsAdmin(true);
            setLoading(false);
            
            // Load reports and verifications
            adminService.listReports({ status: 'open', limitCount: 50 })
              .then((res) => {
                if (!cancelled) setReports(res?.data || []);
              })
              .catch((e) => console.error('[AdminScreen] List reports error:', e));
            
            verificationService.list({ status: 'submitted', limitCount: 50 })
              .then((vres) => {
                if (!cancelled) setVerifs(vres?.data || []);
              })
              .catch((e) => console.error('[AdminScreen] List verifications error:', e));

            adminService.listUserSafetyProfiles({ limitCount: 100 })
              .then((sres) => {
                if (!cancelled) setSafetyProfiles(sres?.data || []);
              })
              .catch((e) => console.error('[AdminScreen] List safety profiles error:', e));
          } else {
            console.log('[AdminScreen] User is not admin. Role:', role || '(missing)');
            setIsAdmin(false);
            setReports([]);
            setVerifs([]);
            setLoading(false);
          }
        },
        (error) => {
          console.error('[AdminScreen] Listener error:', error);
          if (!cancelled) {
            // Fallback to regular load on error
            load();
          }
        }
      );
    };

    setupListener();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'safety' && safetyProfiles.length === 0 && !safetyLoading) {
      loadSafetyProfiles();
    }
    if (tab === 'vulgar' && vulgarAttempts.length === 0 && !vulgarLoading) {
      refreshVulgarAttempts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#FFF5F7', '#EFF6FF', '#F0FDFA']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headerRow}>
            <HuzzPressable style={styles.headerSideBtn} onPress={() => onNavigate('home')} haptic="light">
              <ArrowLeft size={22} color={tokens.colors.text} strokeWidth={2.25} />
            </HuzzPressable>

            <View style={styles.headerWordmarkWrap}>
              <View style={styles.headerBrandBlock}>
                <Text
                  style={[
                    styles.headerHuzzWord,
                    fontsLoaded && styles.headerHuzzWordFont,
                  ]}
                  accessibilityRole="header"
                >
                  Huzz
                </Text>
                <View style={styles.headerUnderlineTrack}>
                  <LinearGradient
                    colors={['#1D4ED8', '#2563EB', '#3B82F6']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              </View>
            </View>

            <HuzzPressable style={styles.headerSideBtn} onPress={() => onNavigate('settings')} haptic="light">
              <Settings size={22} color={tokens.colors.text} strokeWidth={2.25} />
            </HuzzPressable>
          </View>
        </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading admin tools...</Text>
        </View>
      ) : !isAdmin ? (
        <View style={styles.scrollContent}>
          <View style={[styles.card, styles.sectionRose, cardShadow]}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionIconWrap, styles.iconWrapRose]}>
                <Text style={styles.sectionEmoji}>!</Text>
              </View>
              <View style={styles.sectionHeadText}>
                <Text style={styles.sectionTitle}>Admin only</Text>
                <Text style={styles.sectionHint}>
                  Add this user to the `admin` collection with `role: 'admin'`, then reload the screen.
                </Text>
              </View>
            </View>
            <Text style={styles.warnText}>
              Run: node scripts/addAdminToCollection.js {'{userId}'} admin {'{email}'} {'{name}'}
            </Text>
          </View>
        </View>
      ) : (
        <HuzzKeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tokens.spacing.xl + 96 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, styles.sectionViolet, cardShadow]}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionIconWrap, styles.iconWrapViolet]}>
                <Text style={styles.sectionEmoji}>🛡️</Text>
              </View>
              <View style={styles.sectionHeadText}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>Admin portal</Text>
                  <HuzzPressable style={styles.previewPill} onPress={load} haptic="light">
                    <Text style={styles.previewPillText}>Refresh</Text>
                  </HuzzPressable>
                </View>
                <Text style={styles.sectionHint}>
                  Reports, repeat-offender safety summaries, verifications, and user management in one place.
                </Text>
              </View>
            </View>

          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'reports' ? styles.tabBtnOn : null]}
              onPress={() => setTab('reports')}
            >
              <Text style={styles.tabText}>Reports</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'safety' ? styles.tabBtnOn : null]}
              onPress={() => setTab('safety')}
            >
              <Text style={styles.tabText}>Safety</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'verifications' ? styles.tabBtnOn : null]}
              onPress={() => setTab('verifications')}
            >
              <Text style={styles.tabText}>Verifications</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'users' ? styles.tabBtnOn : null]}
              onPress={() => setTab('users')}
            >
              <Text style={styles.tabText}>Users</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'vulgar' ? styles.tabBtnOn : null]}
              onPress={() => setTab('vulgar')}
            >
              <Text style={styles.tabText}>Chat safety</Text>
            </TouchableOpacity>
          </View>
          </View>

          {tab === 'users' && (
            <View style={[styles.card, styles.sectionSky, styles.userManagementBox, cardShadow]}>
              <View style={styles.sectionHead}>
                <View style={[styles.sectionIconWrap, styles.iconWrapSky]}>
                  <Text style={styles.sectionEmoji}>👤</Text>
                </View>
                <View style={styles.sectionHeadText}>
                  <Text style={styles.sectionTitle}>User management</Text>
                  <Text style={styles.sectionHint}>Create user accounts and set staff access.</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnEmerald]}
                onPress={() => setShowCreateUser(!showCreateUser)}
              >
                <Text style={styles.actionText}>+ Create User</Text>
              </TouchableOpacity>

              {showCreateUser && (
                <View style={styles.createUserForm}>
                  <Text style={styles.label}>Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="User's name"
                    value={createUserName}
                    onChangeText={setCreateUserName}
                  />

                  <Text style={styles.label}>Email *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="user@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={createUserEmail}
                    onChangeText={setCreateUserEmail}
                  />

                  <Text style={styles.label}>Password *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Temporary password"
                    secureTextEntry
                    value={createUserPassword}
                    onChangeText={setCreateUserPassword}
                  />

                  <Text style={styles.label}>Role *</Text>
                  <View style={styles.roleButtons}>
                    <TouchableOpacity
                      style={[styles.roleBtn, createUserRole === 'user' && styles.roleBtnSelected]}
                      onPress={() => setCreateUserRole('user')}
                    >
                      <Text style={[styles.roleBtnText, createUserRole === 'user' && styles.roleBtnTextSelected]}>
                        Normal User
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.roleBtn, createUserRole === 'staff' && styles.roleBtnSelected]}
                      onPress={() => setCreateUserRole('staff')}
                    >
                      <Text style={[styles.roleBtnText, createUserRole === 'staff' && styles.roleBtnTextSelected]}>
                        Staff
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {createUserRole === 'staff' && (
                    <Text style={styles.hintText}>
                      Staff will skip email verification and must change password on first login.
                    </Text>
                  )}

                  <View style={styles.createUserActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnEmerald]}
                      onPress={async () => {
                        if (!createUserName || !createUserEmail || !createUserPassword) {
                          Alert.alert('Error', 'Please fill in all fields');
                          return;
                        }
                        setCreatingUser(true);
                        try {
                          const { user, error } = await adminService.createUser({
                            email: createUserEmail,
                            password: createUserPassword,
                            name: createUserName,
                            role: createUserRole,
                          });
                          if (error) {
                            Alert.alert('Error', error);
                          } else {
                            Alert.alert('Success', `${createUserRole === 'staff' ? 'Staff' : 'User'} created successfully!`);
                            setCreateUserName('');
                            setCreateUserEmail('');
                            setCreateUserPassword('');
                            setCreateUserRole('user');
                            setShowCreateUser(false);
                          }
                        } catch (e) {
                          Alert.alert('Error', e.message || 'Failed to create user');
                        } finally {
                          setCreatingUser(false);
                        }
                      }}
                      disabled={creatingUser}
                    >
                      <Text style={styles.actionText}>
                        {creatingUser ? 'Creating...' : `Create ${createUserRole === 'staff' ? 'Staff' : 'User'}`}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnNeutral]}
                      onPress={() => {
                        setShowCreateUser(false);
                        setCreateUserName('');
                        setCreateUserEmail('');
                        setCreateUserPassword('');
                        setCreateUserRole('user');
                      }}
                    >
                      <Text style={styles.actionText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {tab === 'safety' ? (
            safetyLoading ? (
              <View style={[styles.card, styles.sectionSky, styles.emptyBox, cardShadow]}>
                <ActivityIndicator />
                <Text style={styles.emptyTitle}>Loading safety summaries...</Text>
              </View>
            ) : (
              <>
                <View style={[styles.card, styles.sectionSky, cardShadow]}>
                  <View style={styles.sectionHead}>
                    <View style={[styles.sectionIconWrap, styles.iconWrapSky]}>
                      <Text style={styles.sectionEmoji}>🧭</Text>
                    </View>
                    <View style={styles.sectionHeadText}>
                      <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionTitle}>User safety summaries</Text>
                        <HuzzPressable style={styles.previewPill} onPress={loadSafetyProfiles} haptic="light">
                          <Text style={styles.previewPillText}>Refresh</Text>
                        </HuzzPressable>
                      </View>
                      <Text style={styles.sectionHint}>
                        One row per user so repeat behavior is visible without reading every report manually.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.safetyStatsRow}>
                    <View style={styles.safetyStatChip}>
                      <Text style={styles.safetyStatLabel}>Flagged users</Text>
                      <Text style={styles.safetyStatValue}>{safetyProfiles.length}</Text>
                    </View>
                    <View style={styles.safetyStatChip}>
                      <Text style={styles.safetyStatLabel}>Review+</Text>
                      <Text style={styles.safetyStatValue}>
                        {safetyProfiles.filter((item) => ['review', 'restricted'].includes(String(item.riskLevel || ''))).length}
                      </Text>
                    </View>
                  </View>
                </View>

                {selectedSafetyProfile ? (
                  <View style={[styles.reportCard, styles.safetyDetailCard, cardShadow]}>
                    <View style={styles.safetyCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reportTitle}>SAFETY DETAIL</Text>
                        <Text style={styles.safetyUserName}>
                          {selectedSafetyProfile.userName || selectedSafetyProfile.uid || 'Flagged user'}
                        </Text>
                        <Text style={styles.reportMeta}>UID: {selectedSafetyProfile.uid || '-'}</Text>
                      </View>
                      <View
                        style={[
                          styles.riskBadge,
                          selectedSafetyProfile.riskLevel === 'restricted'
                            ? styles.riskBadgeRestricted
                            : selectedSafetyProfile.riskLevel === 'review'
                              ? styles.riskBadgeReview
                              : selectedSafetyProfile.riskLevel === 'watch'
                                ? styles.riskBadgeWatch
                                : styles.riskBadgeClear,
                        ]}
                      >
                        <Text style={styles.riskBadgeText}>
                          {(selectedSafetyProfile.riskLevel || 'clear').toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.details}>
                      {selectedSafetyProfile.recommendedAction || 'No recommended action.'}
                    </Text>

                    <View style={styles.safetyMetricsWrap}>
                      <Text style={styles.safetyMetric}>Flags 30d: {selectedSafetyProfile.recentFlags30d || 0}</Text>
                      <Text style={styles.safetyMetric}>Sexual: {selectedSafetyProfile.sexualFlags30d || 0}</Text>
                      <Text style={styles.safetyMetric}>Harassment: {selectedSafetyProfile.harassmentFlags30d || 0}</Text>
                      <Text style={styles.safetyMetric}>Reports: {selectedSafetyProfile.manualReports30d || 0}</Text>
                      <Text style={styles.safetyMetric}>Copy-paste: {selectedSafetyProfile.copyPasteSignals30d || 0}</Text>
                      <Text style={styles.safetyMetric}>Profanity blocks: {selectedSafetyProfile.profanityBlocks30d || 0}</Text>
                    </View>

                    <View style={styles.safetyReasonList}>
                      {(selectedSafetyProfile.currentReasons || []).length ? (
                        selectedSafetyProfile.currentReasons.map((reason, index) => (
                          <Text key={`${selectedSafetyProfile.uid}-reason-${index}`} style={styles.safetyReason}>
                            • {reason}
                          </Text>
                        ))
                      ) : (
                        <Text style={styles.safetyReason}>• No active summary reasons on this profile.</Text>
                      )}
                    </View>

                    <Text style={styles.label}>Admin status</Text>
                    <View style={styles.statusRow}>
                      {['clear', 'watch', 'review', 'restricted'].map((status) => (
                        <TouchableOpacity
                          key={status}
                          style={[
                            styles.statusPill,
                            String(selectedSafetyProfile.adminStatus || '').toLowerCase() === status
                              ? styles.statusPillOn
                              : null,
                          ]}
                          onPress={() =>
                            setSelectedSafetyProfile((current) =>
                              current ? { ...current, adminStatus: status } : current
                            )
                          }
                        >
                          <Text
                            style={[
                              styles.statusPillText,
                              String(selectedSafetyProfile.adminStatus || '').toLowerCase() === status
                                ? styles.statusPillTextOn
                                : null,
                            ]}
                          >
                            {status}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.label}>Moderator notes</Text>
                    <TextInput
                      style={[styles.input, styles.notesInput]}
                      placeholder="Internal notes for future reviewers"
                      value={safetyNotesDraft}
                      onChangeText={setSafetyNotesDraft}
                      multiline
                    />

                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnSky]}
                        onPress={saveSafetyProfile}
                        disabled={savingSafetyProfile}
                      >
                        <Text style={styles.actionText}>
                          {savingSafetyProfile ? 'Saving...' : 'Save notes'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnRose]}
                        onPress={async () => {
                          const { error } = await adminService.setUserDisabled(selectedSafetyProfile.uid, true);
                          if (error) Alert.alert('Error', error);
                          else Alert.alert('Done', 'User disabled.');
                        }}
                      >
                        <Text style={styles.actionText}>Disable account</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnNeutral]}
                        onPress={() => {
                          setSelectedSafetyProfile(null);
                          setSelectedSafetyEvents([]);
                          setSelectedSafetyReports([]);
                          setSelectedSafetyAttempts([]);
                          setSafetyNotesDraft('');
                        }}
                      >
                        <Text style={styles.actionText}>Close detail</Text>
                      </TouchableOpacity>
                    </View>

                    {safetyDetailLoading ? (
                      <View style={[styles.card, styles.sectionSky, { marginTop: 12 }]}>
                        <ActivityIndicator />
                      </View>
                    ) : (
                      <>
                        <Text style={styles.safetyBlockTitle}>Event timeline</Text>
                        {(selectedSafetyEvents || []).length ? (
                          selectedSafetyEvents.map((event) => (
                            <View key={event.id} style={styles.safetyTimelineRow}>
                              <Text style={styles.reportMeta}>
                                {String(event.source || '').replace(/_/g, ' ')} · {event.severity || 'medium'}
                              </Text>
                              <Text style={styles.details}>{event.details || 'No details saved.'}</Text>
                              <Text style={styles.timelineMeta}>
                                {event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Unknown time'}
                              </Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.emptyText}>No timeline events yet.</Text>
                        )}

                        <Text style={styles.safetyBlockTitle}>Linked reports</Text>
                        {(selectedSafetyReports || []).length ? (
                          selectedSafetyReports.map((report) => (
                            <View key={report.id} style={styles.safetyTimelineRow}>
                              <Text style={styles.reportMeta}>
                                {String(report.reason || 'report').toUpperCase()} · {report.status || 'open'}
                              </Text>
                              <Text style={styles.details}>{report.details || 'No report details.'}</Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.emptyText}>No linked reports.</Text>
                        )}

                        <Text style={styles.safetyBlockTitle}>Blocked profanity attempts</Text>
                        {(selectedSafetyAttempts || []).length ? (
                          selectedSafetyAttempts.map((attempt) => (
                            <View key={attempt.id} style={styles.safetyTimelineRow}>
                              <Text style={styles.reportMeta}>Match: {attempt.matchId || '-'}</Text>
                              <Text style={styles.details}>{attempt.originalMessage || 'Blocked message'}</Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.emptyText}>No blocked attempts recorded.</Text>
                        )}
                      </>
                    )}
                  </View>
                ) : null}

                {safetyProfiles.length === 0 ? (
                  <View style={[styles.card, styles.sectionSky, styles.emptyBox, cardShadow]}>
                    <Text style={styles.emptyTitle}>No flagged users yet</Text>
                    <Text style={styles.emptyText}>Safety profiles will appear here once events are recorded.</Text>
                  </View>
                ) : (
                  safetyProfiles.map((profile) => (
                    <View key={profile.uid || profile.id} style={[styles.reportCard, cardShadow]}>
                      <View style={styles.safetyCardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.reportTitle}>USER SAFETY</Text>
                          <Text style={styles.safetyUserName}>{profile.userName || profile.uid || 'Unknown user'}</Text>
                          <Text style={styles.reportMeta}>UID: {profile.uid || '-'}</Text>
                        </View>
                        <View
                          style={[
                            styles.riskBadge,
                            profile.riskLevel === 'restricted'
                              ? styles.riskBadgeRestricted
                              : profile.riskLevel === 'review'
                                ? styles.riskBadgeReview
                                : profile.riskLevel === 'watch'
                                  ? styles.riskBadgeWatch
                                  : styles.riskBadgeClear,
                          ]}
                        >
                          <Text style={styles.riskBadgeText}>{String(profile.riskLevel || 'clear').toUpperCase()}</Text>
                        </View>
                      </View>
                      <Text style={styles.reportMeta}>
                        Flags 30d: {profile.recentFlags30d || 0} · Reports: {profile.manualReports30d || 0} · Copy-paste: {profile.copyPasteSignals30d || 0}
                      </Text>
                      {(profile.currentReasons || []).length ? (
                        <Text style={styles.details}>{profile.currentReasons.join(' • ')}</Text>
                      ) : (
                        <Text style={styles.details}>No active summary reasons.</Text>
                      )}
                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnSky]}
                          onPress={() => openSafetyProfile(profile.uid)}
                        >
                          <Text style={styles.actionText}>Open detail</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnNeutral]}
                          onPress={() => {
                            setSelectedSafetyProfile(null);
                            setSelectedSafetyEvents([]);
                            setSelectedSafetyReports([]);
                            setSelectedSafetyAttempts([]);
                            setSafetyNotesDraft('');
                            openSafetyProfile(profile.uid);
                          }}
                        >
                          <Text style={styles.actionText}>Refresh detail</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </>
            )
          ) : tab === 'vulgar' ? (
            vulgarLoading ? (
              <View style={[styles.card, styles.sectionAmber, styles.emptyBox, cardShadow]}>
                <ActivityIndicator />
                <Text style={styles.emptyTitle}>Loading...</Text>
              </View>
            ) : vulgarAttempts.length === 0 ? (
              <View style={[styles.card, styles.sectionAmber, styles.emptyBox, cardShadow]}>
                <Text style={styles.emptyTitle}>No vulgar attempts</Text>
                <Text style={styles.emptyText}>Blocked chat messages will appear here.</Text>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnNeutral, { marginTop: 12 }]}
                  onPress={refreshVulgarAttempts}
                >
                  <Text style={styles.actionText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnNeutral, { alignSelf: 'flex-start', marginBottom: 8 }]}
                  onPress={refreshVulgarAttempts}
                >
                  <Text style={styles.actionText}>Refresh</Text>
                </TouchableOpacity>
                {vulgarAttempts.map((a) => (
                <View key={a.id} style={[styles.reportCard, cardShadow]}>
                  <Text style={styles.reportTitle}>BLOCKED MESSAGE</Text>
                  <Text style={styles.reportMeta}>User: {a.userId || '-'}</Text>
                  {a.matchId ? <Text style={styles.reportMeta}>Match: {a.matchId}</Text> : null}
                  <Text style={styles.reportMeta}>Status: {String(a.status || 'blocked').toUpperCase()}</Text>
                  {a.originalMessage ? (
                    <Text style={styles.details}>Original: “{String(a.originalMessage).slice(0, 300)}”</Text>
                  ) : null}
                  {a.createdAt ? (
                    <Text style={styles.reportMeta}>
                      {new Date(a.createdAt).toLocaleString()}
                    </Text>
                  ) : null}
                  {a.userId ? (
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnSky]}
                        onPress={() => {
                          setTab('safety');
                          openSafetyProfile(a.userId);
                        }}
                      >
                        <Text style={styles.actionText}>Open safety profile</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              ))}
              </>
            )
          ) : tab === 'verifications' ? (
            verifs.length === 0 ? (
              <View style={[styles.card, styles.sectionEmerald, styles.emptyBox, cardShadow]}>
                <Text style={styles.emptyTitle}>No verification requests</Text>
                <Text style={styles.emptyText}>You’re all caught up.</Text>
              </View>
            ) : (
              verifs.map((v) => (
                <View key={v.id} style={[styles.reportCard, cardShadow]}>
                  <Text style={styles.reportTitle}>VERIFICATION</Text>
                  <Text style={styles.reportMeta}>User: {v.uid}</Text>
                  <Text style={styles.reportMeta}>Language: {v.language || '-'}</Text>
                  <Text style={styles.reportMeta}>Status: {String(v.status || '').toUpperCase()}</Text>
                  {v.transcript ? <Text style={styles.details}>“{String(v.transcript).slice(0, 220)}”</Text> : null}
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnSky]}
                      onPress={() => {
                        const url = String(v.selfieUrl || '');
                        if (url) Linking.openURL(url);
                        else Alert.alert('Missing', 'No selfie URL found.');
                      }}
                    >
                      <Text style={styles.actionText}>Open selfie</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnSky]}
                      onPress={() => {
                        const url = String(v.videoUrl || '');
                        if (url) Linking.openURL(url);
                        else Alert.alert('Missing', 'No video URL found.');
                      }}
                    >
                      <Text style={styles.actionText}>Open video</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnEmerald]}
                      onPress={async () => {
                        const adminUid = authService.getCurrentUser()?.uid || null;
                        const { error } = await verificationService.review(v.id, { status: 'approved' }, adminUid);
                        if (error) Alert.alert('Error', error);
                        else {
                          Alert.alert('Approved', 'User is now verified.');
                          load();
                        }
                      }}
                    >
                      <Text style={styles.actionText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnRose]}
                      onPress={async () => {
                        Alert.alert('Reject?', 'Reject this verification request?', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Reject',
                            style: 'destructive',
                            onPress: async () => {
                              const adminUid = authService.getCurrentUser()?.uid || null;
                              const { error } = await verificationService.review(
                                v.id,
                                { status: 'rejected', decisionNote: 'Please re-submit with a clearer selfie/video.' },
                                adminUid
                              );
                              if (error) Alert.alert('Error', error);
                              else {
                                Alert.alert('Rejected', 'User was notified.');
                                load();
                              }
                            },
                          },
                        ]);
                      }}
                    >
                      <Text style={styles.actionText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )
          ) : reports.length === 0 ? (
            <View style={[styles.card, styles.sectionRose, styles.emptyBox, cardShadow]}>
              <Text style={styles.emptyTitle}>No open reports</Text>
              <Text style={styles.emptyText}>You’re all caught up.</Text>
            </View>
          ) : (
            reports.map((r) => (
              <View key={r.id} style={[styles.reportCard, cardShadow]}>
                <Text style={styles.reportTitle}>{String(r.targetType || 'report').toUpperCase()}</Text>
                <Text style={styles.reportMeta}>Reason: {r.reason || '-'}</Text>
                <Text style={styles.reportMeta}>
                  Categories: {Array.isArray(r.categories) && r.categories.length ? r.categories.join(', ') : '-'}
                </Text>
                <Text style={styles.reportMeta}>Target: {r.targetId || '-'}</Text>
                <Text style={styles.reportMeta}>Target user: {r.targetUserId || '-'}</Text>
                <Text style={styles.reportMeta}>Reporter: {r.reporterUid || '-'}</Text>
                {r.matchId ? <Text style={styles.reportMeta}>Match: {r.matchId}</Text> : null}
                {r.autoFlagged ? <Text style={styles.badge}>AUTO-FLAGGED</Text> : null}
                {r.details ? <Text style={styles.details}>“{String(r.details).slice(0, 240)}”</Text> : null}

                <View style={styles.actions}>
                  {(r.targetType === 'user' || (r.targetType === 'message' && r.targetUserId)) && (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnRose]}
                      onPress={async () => {
                        Alert.alert('Disable user?', 'This will block them from using the app.', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Disable',
                            style: 'destructive',
                            onPress: async () => {
                              const uid = r.targetType === 'user' ? r.targetId : r.targetUserId;
                              const { error } = await adminService.setUserDisabled(uid, true);
                              if (error) Alert.alert('Error', error);
                              else Alert.alert('Done', 'User disabled.');
                            },
                          },
                        ]);
                      }}
                    >
                      <Text style={styles.actionText}>Disable account</Text>
                    </TouchableOpacity>
                  )}

                  {r.targetUserId ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnAmber]}
                      onPress={async () => {
                        Alert.alert('Ban device?', 'This blocks sign-in from the same device (soft gate).', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Ban device',
                            style: 'destructive',
                            onPress: async () => {
                              const res = await userService.getUserById(r.targetUserId);
                              const deviceHash = String(res?.data?.deviceHash || '');
                              if (!deviceHash) {
                                Alert.alert('No device hash', 'This user has no deviceHash recorded yet.');
                                return;
                              }
                              const adminUid = authService.getCurrentUser()?.uid || null;
                              const { error } = await deviceBanService.banDevice(deviceHash, {
                                bannedByUid: adminUid,
                                reason: `report:${r.id}`,
                              });
                              if (error) Alert.alert('Error', error);
                              else Alert.alert('Done', 'Device banned (soft).');
                            },
                          },
                        ]);
                      }}
                    >
                      <Text style={styles.actionText}>Ban device</Text>
                    </TouchableOpacity>
                  ) : null}

                  {r.targetUserId ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnSky]}
                      onPress={() => {
                        setTab('safety');
                        openSafetyProfile(r.targetUserId);
                      }}
                    >
                      <Text style={styles.actionText}>Open safety profile</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnEmerald]}
                    onPress={async () => {
                      const { error } = await adminService.resolveReport(r.id, { status: 'closed', actionTaken: 'resolved' });
                      if (error) Alert.alert('Error', error);
                      else {
                        Alert.alert('Resolved', 'Report closed.');
                        load();
                      }
                    }}
                  >
                    <Text style={styles.actionText}>Resolve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </HuzzKeyboardAwareScrollView>
      )}
    </SafeAreaView>
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
    backgroundColor: tokens.colors.surface,
  },
  header: {
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingBottom: 10,
    minHeight: 60,
    zIndex: 10,
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
    minHeight: 56,
  },
  headerSideBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerWordmarkWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  headerBrandBlock: {
    alignItems: 'center',
  },
  headerHuzzWord: {
    fontSize: 40,
    letterSpacing: 0.5,
    color: '#1c1917',
    fontWeight: '700',
    fontStyle: 'italic',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(28, 25, 23, 0.12)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      },
      android: {},
    }),
  },
  headerHuzzWordFont: {
    fontFamily: 'KaushanScript_400Regular',
    fontWeight: '400',
    fontStyle: 'normal',
  },
  headerUnderlineTrack: {
    marginTop: 4,
    width: 100,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    opacity: 0.85,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
    flexGrow: 1,
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
  sectionEmoji: {
    fontSize: 18,
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
    lineHeight: 18,
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
  sectionAmber: {
    backgroundColor: tokens.colors.filterBgAmber,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderAmber,
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
  warnText: {
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.textSecondary,
    lineHeight: 20,
  },
  emptyBox: {
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.colors.text,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.textSecondary,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  tabBtn: {
    minWidth: '47%',
    flexGrow: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    backgroundColor: 'rgba(255,255,255,0.82)',
    alignItems: 'center',
  },
  tabBtnOn: {
    backgroundColor: tokens.colors.accentDim,
    borderColor: tokens.colors.accent,
  },
  tabText: {
    fontWeight: '700',
    color: tokens.colors.text,
    letterSpacing: -0.1,
    fontSize: 13,
  },
  reportCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.lg,
    padding: 16,
    marginBottom: 12,
  },
  reportTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.colors.accent,
    letterSpacing: 0.8,
  },
  reportMeta: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colors.text,
    lineHeight: 18,
  },
  badge: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '800',
    color: tokens.colors.accent,
    letterSpacing: 0.8,
  },
  details: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.textSecondary,
    lineHeight: 19,
  },
  safetyCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  safetyUserName: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '800',
    color: tokens.colors.text,
  },
  riskBadge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
  },
  riskBadgeClear: {
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.border,
  },
  riskBadgeWatch: {
    backgroundColor: tokens.colors.filterBgAmber,
    borderColor: tokens.colors.filterBorderAmber,
  },
  riskBadgeReview: {
    backgroundColor: tokens.colors.filterBgSky,
    borderColor: tokens.colors.filterBorderSky,
  },
  riskBadgeRestricted: {
    backgroundColor: tokens.colors.filterBgRose,
    borderColor: tokens.colors.filterBorderRose,
  },
  riskBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: tokens.colors.text,
    letterSpacing: 0.4,
  },
  safetyStatsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  safetyStatChip: {
    minWidth: 120,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  safetyStatLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.textMuted,
  },
  safetyStatValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '800',
    color: tokens.colors.text,
  },
  safetyDetailCard: {
    backgroundColor: '#fff',
  },
  safetyMetricsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  safetyMetric: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.filterBgSky,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderSky,
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  safetyReasonList: {
    marginTop: 12,
    gap: 6,
  },
  safetyReason: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  statusPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  statusPillOn: {
    backgroundColor: tokens.colors.accentDim,
    borderColor: tokens.colors.accent,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  statusPillTextOn: {
    color: tokens.colors.accent,
  },
  notesInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  safetyBlockTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '800',
    color: tokens.colors.text,
  },
  safetyTimelineRow: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.colors.border,
  },
  timelineMeta: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  actionBtnEmerald: {
    backgroundColor: tokens.colors.filterBgEmerald,
    borderColor: tokens.colors.filterBorderEmerald,
  },
  actionBtnSky: {
    backgroundColor: tokens.colors.filterBgSky,
    borderColor: tokens.colors.filterBorderSky,
  },
  actionBtnRose: {
    backgroundColor: tokens.colors.filterBgRose,
    borderColor: tokens.colors.filterBorderRose,
  },
  actionBtnAmber: {
    backgroundColor: tokens.colors.filterBgAmber,
    borderColor: tokens.colors.filterBorderAmber,
  },
  actionBtnNeutral: {
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.border,
  },
  actionText: {
    fontWeight: '700',
    color: tokens.colors.text,
    letterSpacing: -0.1,
    fontSize: 13,
  },
  userManagementBox: {
    marginBottom: 10,
  },
  createUserForm: {
    marginTop: 12,
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colors.text,
    marginBottom: 4,
  },
  input: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    padding: 12,
    fontSize: 16,
    color: tokens.colors.text,
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 8,
  },
  roleBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surface,
    alignItems: 'center',
  },
  roleBtnSelected: {
    backgroundColor: tokens.colors.accentDim,
    borderColor: tokens.colors.accent,
  },
  roleBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  roleBtnTextSelected: {
    color: tokens.colors.accent,
  },
  hintText: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
    marginTop: 4,
  },
  createUserActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
});


