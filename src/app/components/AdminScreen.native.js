import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, Platform, Image, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { tokens, brandShellGradientSoft } from '../../ui/tokens';
import { adminService, appUpdateService, authService, deviceBanService, moderationNoticeService, privacyAdminService, userService, verificationService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { PLAY_STORE_WEB_URL } from '../../config/appStore';
import { exportService } from '../../services/exportService';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ArrowLeft, Settings } from 'lucide-react-native';
import { useFonts, KaushanScript_400Regular } from '@expo-google-fonts/kaushan-script';
import { AdminUserDirectory } from './AdminUserDirectory.native';
import { AdminPrivacyDesk } from './AdminPrivacyDesk.native';
import { AdminAppealsDesk } from './AdminAppealsDesk.native';

const BAN_REASON_TEMPLATES = [
  {
    key: 'harassment',
    label: 'Harassment',
    disableReason: 'harassment',
    outcome:
      'We reviewed your report. Thank you for helping keep Wasl safe. We took action under our harassment rules. We cannot share details about other accounts.',
  },
  {
    key: 'sexual',
    label: 'Sexual content',
    disableReason: 'sexual_content',
    outcome:
      'We reviewed your report about inappropriate content. Thank you. We took action under our community guidelines. We cannot share details about other accounts.',
  },
  {
    key: 'spam',
    label: 'Spam / scam',
    disableReason: 'spam_scam',
    outcome:
      'We reviewed your report. Thank you for flagging possible spam or scam behaviour. We took action where needed. We cannot share details about other accounts.',
  },
  {
    key: 'underage',
    label: 'Underage concern',
    disableReason: 'age_safety',
    outcome:
      'We reviewed your report related to age or safety. Thank you — we take these reports seriously and took appropriate action. We cannot share details about other accounts.',
  },
  {
    key: 'generic',
    label: 'Reviewed',
    disableReason: 'policy',
    outcome:
      'We reviewed your report. Thank you for helping keep Wasl safe. We cannot share what action, if any, was taken with the other person.',
  },
];


function shortId(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (text.length <= 14) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function formatTimestamp(value) {
  if (!value) return '—';
  try {
    const ms =
      typeof value?.toMillis === 'function'
        ? value.toMillis()
        : typeof value === 'number'
          ? value
          : Date.parse(String(value));
    if (!ms || Number.isNaN(ms)) return '—';
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

function formatPhone(user) {
  const last4 = String(user?.phoneLast4 || '').trim();
  if (last4) return `•••• ${last4}`;
  return 'Not on file';
}

function formatUserLocation(user) {
  const city = String(user?.city || '').trim();
  const country = String(user?.country || user?.countryOfResidence || '').trim();
  if (city && country) return `${city}, ${country}`;
  return city || country || user?.location || '';
}

function getPrimaryImage(user) {
  const images = Array.isArray(user?.images) ? user.images : [];
  return images.find((img) => typeof img === 'string' && img.trim()) || user?.photoURL || null;
}

const WARNING_TEMPLATE_OPTIONS = [
  { id: 'sexual', label: 'Sexual content' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'spam', label: 'Spam / copy-paste' },
  { id: 'scam_risk', label: 'Scam risk' },
  { id: 'profanity', label: 'Blocked profanity' },
];

function inferWarningTemplate({ categories = [], reason = '', fallback = 'harassment' } = {}) {
  const list = Array.isArray(categories) ? categories.map((x) => String(x).toLowerCase()) : [];
  const normalizedReason = String(reason || '').toLowerCase();
  if (list.includes('sexual') || normalizedReason.includes('sexual')) return 'sexual';
  if (list.includes('spam') || list.includes('copy_paste') || normalizedReason.includes('spam')) return 'spam';
  if (list.includes('scam_risk') || normalizedReason.includes('scam')) return 'scam_risk';
  if (list.includes('harassment') || normalizedReason.includes('harass')) return 'harassment';
  if (list.includes('profanity') || normalizedReason.includes('profan')) return 'profanity';
  return fallback;
}

export function AdminScreen({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reports, setReports] = useState([]);
  const [verifs, setVerifs] = useState([]);
  const [tab, setTab] = useState('reports'); // 'reports' | 'safety' | 'verifications' | 'users' | 'vulgar' | 'update' | 'deletions' | 'crashes' | 'appeals'
  const [vulgarAttempts, setVulgarAttempts] = useState([]);
  const [vulgarLoading, setVulgarLoading] = useState(false);
  const [usersById, setUsersById] = useState({});
  const [matchesById, setMatchesById] = useState({});
  const [messageAuthorByReportId, setMessageAuthorByReportId] = useState({});
  const [safetyProfiles, setSafetyProfiles] = useState([]);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [selectedSafetyProfile, setSelectedSafetyProfile] = useState(null);
  const [selectedSafetyEvents, setSelectedSafetyEvents] = useState([]);
  const [selectedSafetyReports, setSelectedSafetyReports] = useState([]);
  const [selectedSafetyAttempts, setSelectedSafetyAttempts] = useState([]);
  const [selectedModerationContext, setSelectedModerationContext] = useState({ reportId: '', matchId: '' });
  const [safetyDetailLoading, setSafetyDetailLoading] = useState(false);
  const [safetyNotesDraft, setSafetyNotesDraft] = useState('');
  const [savingSafetyProfile, setSavingSafetyProfile] = useState(false);
  const [warningTemplateKey, setWarningTemplateKey] = useState('sexual');
  const [warningCustomMessage, setWarningCustomMessage] = useState('');
  const [warningReferenceNotes, setWarningReferenceNotes] = useState('');
  const [warningAttachCsv, setWarningAttachCsv] = useState(true);
  const [warningActionLoading, setWarningActionLoading] = useState(false);
  const [lastEvidenceMeta, setLastEvidenceMeta] = useState(null);
  const [warningComposer, setWarningComposer] = useState({
    visible: false,
    targetUid: '',
    targetName: '',
    reportId: '',
    matchId: '',
  });
  const [outcomeDrafts, setOutcomeDrafts] = useState({});
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createUserEmail, setCreateUserEmail] = useState('');
  const [createUserPassword, setCreateUserPassword] = useState('');
  const [createUserName, setCreateUserName] = useState('');
  const [createUserRole, setCreateUserRole] = useState('user'); // 'user' | 'staff'
  const [creatingUser, setCreatingUser] = useState(false);
  const [updateAlertTitle, setUpdateAlertTitle] = useState('Update Huzz');
  const [updateAlertBody, setUpdateAlertBody] = useState(
    'A new version is available. Update from the Play Store to keep using Huzz.'
  );
  const [updateAlertMinVersion, setUpdateAlertMinVersion] = useState('');
  const [currentUpdateAlert, setCurrentUpdateAlert] = useState(null);
  const [broadcastingUpdate, setBroadcastingUpdate] = useState(false);
  const [clearingUpdate, setClearingUpdate] = useState(false);
  const [fontsLoaded] = useFonts({ KaushanScript_400Regular });
  const insets = useSafeAreaInsets();
  const safetyProfilesByUid = useMemo(
    () =>
      Object.fromEntries(
        (safetyProfiles || [])
          .filter((profile) => profile?.uid)
          .map((profile) => [String(profile.uid), profile])
      ),
    [safetyProfiles]
  );

  const getUserCardData = (uid) => {
    const userId = String(uid || '').trim();
    if (!userId) return null;
    const user = usersById[userId] || {};
    const displayName = String(user.name || '').trim();
    const fallbackName = displayName || (user.email ? String(user.email).split('@')[0] : `User ${shortId(userId)}`);
    return {
      uid: userId,
      name: fallbackName,
      email: String(user.email || '').trim() || 'No email on file',
      phone: formatPhone(user),
      location: formatUserLocation(user),
      imageUrl: getPrimaryImage(user),
      hasResolvedProfile: !!(displayName || user.email),
    };
  };

  const refreshVulgarAttempts = async () => {
    setVulgarLoading(true);
    try {
      const res = await adminService.listVulgarAttempts({ limitCount: 100 });
      setVulgarAttempts(res?.data || []);
    } finally {
      setVulgarLoading(false);
    }
  };

  const handleBroadcastAppUpdate = () => {
    Alert.alert(
      'Send update alert?',
      'Everyone using the app will get a push notification and a blocking screen until you clear this alert or they update.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send to all users',
          style: 'destructive',
          onPress: async () => {
            setBroadcastingUpdate(true);
            try {
              const res = await appUpdateService.broadcastAppUpdate({
                title: updateAlertTitle,
                body: updateAlertBody,
                minVersion: updateAlertMinVersion,
              });
              if (res?.error) {
                Alert.alert('Failed', res.error);
                return;
              }
              Alert.alert(
                'Update alert sent',
                `Push sent to ${res.pushSent || 0} devices (${res.tokensFound || 0} tokens found).`
              );
            } finally {
              setBroadcastingUpdate(false);
            }
          },
        },
      ]
    );
  };

  const handleClearAppUpdate = () => {
    Alert.alert('Clear update alert?', 'Users will be able to use the app again without updating.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear alert',
        onPress: async () => {
          setClearingUpdate(true);
          try {
            const res = await appUpdateService.clearAppUpdateAlert();
            if (res?.error) {
              Alert.alert('Failed', res.error);
            }
          } finally {
            setClearingUpdate(false);
          }
        },
      },
    ]);
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

  const openSafetyProfile = async (uid, context = {}) => {
    if (!uid) return;
    setSelectedModerationContext({
      reportId: String(context?.reportId || ''),
      matchId: String(context?.matchId || ''),
    });
    setSafetyDetailLoading(true);
    try {
      const res = await adminService.getUserSafetyProfile(uid, { limitCount: 40 });
      const detail = res?.data || null;
      setSelectedSafetyProfile(detail?.profile || null);
      setSelectedSafetyEvents(detail?.events || []);
      setSelectedSafetyReports(detail?.reports || []);
      setSelectedSafetyAttempts(detail?.vulgarAttempts || []);
      setSafetyNotesDraft(String(detail?.profile?.adminNotes || ''));
      setLastEvidenceMeta(null);
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
      await Promise.all([loadSafetyProfiles(), openSafetyProfile(selectedSafetyProfile.uid, selectedModerationContext)]);
      Alert.alert('Saved', 'Safety notes updated.');
    } finally {
      setSavingSafetyProfile(false);
    }
  };

  const openWarningComposer = ({
    targetUid,
    targetName = '',
    reportId = '',
    matchId = '',
    templateKey = 'harassment',
    referenceNotes = '',
  } = {}) => {
    if (!targetUid) return;
    setWarningTemplateKey(templateKey);
    setWarningReferenceNotes(referenceNotes);
    setWarningCustomMessage('');
    setWarningAttachCsv(true);
    setLastEvidenceMeta(null);
    setWarningComposer({
      visible: true,
      targetUid: String(targetUid),
      targetName: String(targetName || ''),
      reportId: String(reportId || ''),
      matchId: String(matchId || ''),
    });
  };

  const closeWarningComposer = () => {
    setWarningComposer((current) => ({ ...current, visible: false }));
  };

  const resolveEvidenceContext = () => ({
    reportId: selectedModerationContext.reportId || selectedSafetyReports?.[0]?.id || '',
    matchId:
      selectedModerationContext.matchId ||
      selectedSafetyReports?.find((report) => report?.matchId)?.matchId ||
      selectedSafetyAttempts?.find((attempt) => attempt?.matchId)?.matchId ||
      '',
  });

  const generateEvidenceCsv = async () => {
    const targetUid = warningComposer.visible ? warningComposer.targetUid : selectedSafetyProfile?.uid;
    if (!targetUid) return;
    const context = warningComposer.visible
      ? { reportId: warningComposer.reportId || '', matchId: warningComposer.matchId || '' }
      : resolveEvidenceContext();
    setWarningActionLoading(true);
    try {
      const { data, error } = await moderationNoticeService.generateEvidence(targetUid, context);
      if (error || !data?.csvContent) {
        Alert.alert('Error', error || 'Failed to generate evidence CSV.');
        return;
      }
      const saveRes = await exportService.saveCsvContent(data.csvContent, data.filename || `moderation_${Date.now()}.csv`);
      if (saveRes.error) {
        Alert.alert('Error', saveRes.error);
        return;
      }
      setLastEvidenceMeta({
        filename: data.filename,
        rowCount: data.rowCount,
        generatedFor: data?.target?.name || warningComposer.targetName || selectedSafetyProfile?.userName || targetUid,
      });
      Alert.alert('Evidence ready', 'CSV generated and shared.');
    } finally {
      setWarningActionLoading(false);
    }
  };

  const sendModerationEmail = async (actionType, { includeEvidence = true } = {}) => {
    const targetUid = warningComposer.visible ? warningComposer.targetUid : selectedSafetyProfile?.uid;
    if (!targetUid) return;
    const context = warningComposer.visible
      ? { reportId: warningComposer.reportId || '', matchId: warningComposer.matchId || '' }
      : resolveEvidenceContext();
    setWarningActionLoading(true);
    try {
      const { data, error } = await moderationNoticeService.sendNotice({
        targetUid,
        templateKey: warningTemplateKey,
        customMessage: warningCustomMessage,
        referenceNotes: warningReferenceNotes,
        actionType,
        includeEvidence,
        ...context,
      });
      if (error) {
        Alert.alert('Error', error);
        return;
      }
      Alert.alert(
        actionType === 'warning' ? 'Warning sent' : 'Final notice sent',
        `Email sent to ${data?.emailedTo || 'the user'}.`
      );
      closeWarningComposer();
      await Promise.all([
        load(),
        loadSafetyProfiles(),
        selectedSafetyProfile?.uid ? openSafetyProfile(selectedSafetyProfile.uid, context) : Promise.resolve(),
      ]);
    } finally {
      setWarningActionLoading(false);
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
    if (!isAdmin) return undefined;
    return appUpdateService.listenCurrentAlert(({ data }) => {
      setCurrentUpdateAlert(data || null);
    });
  }, [isAdmin]);

  useEffect(() => {
    if (tab === 'safety' && safetyProfiles.length === 0 && !safetyLoading) {
      loadSafetyProfiles();
    }
    if (tab === 'vulgar' && vulgarAttempts.length === 0 && !vulgarLoading) {
      refreshVulgarAttempts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    let cancelled = false;

    const loadModerationContext = async () => {
      const reportList = Array.isArray(reports) ? reports : [];
      const vulgarList = Array.isArray(vulgarAttempts) ? vulgarAttempts : [];
      if (reportList.length === 0 && vulgarList.length === 0) {
        if (!cancelled) {
          setUsersById({});
          setMatchesById({});
          setMessageAuthorByReportId({});
        }
        return;
      }

      try {
        const userIds = new Set();
        const matchIds = new Set();
        const unresolvedMessageReports = [];

        reportList.forEach((report) => {
          if (report?.reporterUid) userIds.add(String(report.reporterUid));
          if (report?.targetUserId) userIds.add(String(report.targetUserId));
          if (report?.targetType === 'user' && report?.targetId) userIds.add(String(report.targetId));
          if (report?.matchId) matchIds.add(String(report.matchId));
          if (report?.targetType === 'message' && report?.matchId && report?.targetId && !report?.targetUserId) {
            unresolvedMessageReports.push(report);
          }
        });

        vulgarList.forEach((attempt) => {
          if (attempt?.userId) userIds.add(String(attempt.userId));
          if (attempt?.matchId) matchIds.add(String(attempt.matchId));
        });

        (Array.isArray(verifs) ? verifs : []).forEach((v) => {
          if (v?.uid) userIds.add(String(v.uid));
        });

        (Array.isArray(safetyProfiles) ? safetyProfiles : []).forEach((p) => {
          if (p?.uid) userIds.add(String(p.uid));
        });

        const resolvedMessageAuthors = {};
        await Promise.all(
          unresolvedMessageReports.map(async (report) => {
            try {
              const messageSnap = await getDoc(
                doc(db, 'matches', String(report.matchId), 'messages', String(report.targetId))
              );
              const fromUid = messageSnap.exists() ? String(messageSnap.data()?.fromUid || '') : '';
              if (fromUid) {
                resolvedMessageAuthors[report.id] = fromUid;
                userIds.add(fromUid);
              }
            } catch {}
          })
        );

        const matchDocs = await Promise.all(
          Array.from(matchIds).map(async (matchId) => {
            try {
              const snap = await getDoc(doc(db, 'matches', String(matchId)));
              return [matchId, snap.exists() ? snap.data() || {} : null];
            } catch {
              return [matchId, null];
            }
          })
        );

        matchDocs.forEach(([, matchData]) => {
          const participants = Array.isArray(matchData?.uids) ? matchData.uids.map(String) : [];
          participants.forEach((uid) => userIds.add(uid));
        });

        const userEntries = await Promise.all(
          Array.from(userIds).map(async (uid) => {
            try {
              const snap = await getDoc(doc(db, 'users', String(uid)));
              return [uid, snap.exists() ? snap.data() || {} : {}];
            } catch {
              return [uid, {}];
            }
          })
        );

        if (!cancelled) {
          setUsersById(Object.fromEntries(userEntries));
          setMatchesById(Object.fromEntries(matchDocs));
          setMessageAuthorByReportId(resolvedMessageAuthors);
        }
      } catch (error) {
        console.error('[AdminScreen] Moderation context error:', error);
      }
    };

    loadModerationContext();
    return () => {
      cancelled = true;
    };
  }, [reports, vulgarAttempts, verifs, safetyProfiles]);

  const renderUserMiniCard = (label, user, { subtle = false } = {}) => {
    if (!user) return null;
    return (
      <View style={[styles.personRow, subtle ? styles.personRowSubtle : null]}>
        <Text style={styles.personLabel}>{label}</Text>
        {user.imageUrl ? (
          <Image source={{ uri: user.imageUrl }} style={styles.personAvatar} />
        ) : (
          <View style={styles.personAvatarFallback}>
            <Text style={styles.personAvatarLetter}>
              {String(user.name || '?').trim().charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
        )}
        <View style={styles.personTextWrap}>
          <Text style={styles.personName}>{user.name}</Text>
          <Text style={styles.personDetail} selectable>
            {user.email}
          </Text>
          <Text style={styles.personDetail}>Phone: {user.phone}</Text>
          {user.location ? <Text style={styles.personDetail}>{user.location}</Text> : null}
          <Text style={styles.personMeta} selectable>
            UID: {user.uid}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={brandShellGradientSoft}
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
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'update' ? styles.tabBtnOn : null]}
              onPress={() => setTab('update')}
            >
              <Text style={styles.tabText}>App update</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'deletions' ? styles.tabBtnOn : null]}
              onPress={() => setTab('deletions')}
            >
              <Text style={styles.tabText}>Deletions</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'crashes' ? styles.tabBtnOn : null]}
              onPress={() => setTab('crashes')}
            >
              <Text style={styles.tabText}>Crashes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'appeals' ? styles.tabBtnOn : null]}
              onPress={() => setTab('appeals')}
            >
              <Text style={styles.tabText}>Appeals</Text>
            </TouchableOpacity>
          </View>
          </View>

          {tab === 'appeals' && (
            <View style={[styles.card, styles.sectionEmerald, cardShadow]}>
              <View style={styles.sectionHead}>
                <View style={[styles.sectionIconWrap, styles.iconWrapEmerald]}>
                  <Text style={styles.sectionEmoji}>⚖️</Text>
                </View>
                <View style={styles.sectionHeadText}>
                  <Text style={styles.sectionTitle}>Appeals</Text>
                  <Text style={styles.sectionHint}>
                    Review ban/disable appeals. Approve, reject, or convert to shadowban.
                  </Text>
                </View>
              </View>
              <AdminAppealsDesk />
            </View>
          )}

          {tab === 'deletions' && (
            <View style={[styles.card, styles.sectionEmerald, cardShadow]}>
              <View style={styles.sectionHead}>
                <View style={[styles.sectionIconWrap, styles.iconWrapEmerald]}>
                  <Text style={styles.sectionEmoji}>🗑️</Text>
                </View>
                <View style={styles.sectionHeadText}>
                  <Text style={styles.sectionTitle}>Deletion requests</Text>
                  <Text style={styles.sectionHint}>
                    Process account/data removal and email users from the OTP mailbox.
                  </Text>
                </View>
              </View>
              <AdminPrivacyDesk mode="deletions" />
            </View>
          )}

          {tab === 'crashes' && (
            <View style={[styles.card, styles.sectionEmerald, cardShadow]}>
              <View style={styles.sectionHead}>
                <View style={[styles.sectionIconWrap, styles.iconWrapEmerald]}>
                  <Text style={styles.sectionEmoji}>💥</Text>
                </View>
                <View style={styles.sectionHeadText}>
                  <Text style={styles.sectionTitle}>Crash logs</Text>
                  <Text style={styles.sectionHint}>
                    Device-reported fatals and errors for debugging.
                  </Text>
                </View>
              </View>
              <AdminPrivacyDesk mode="crashes" />
            </View>
          )}

          {tab === 'update' && (
            <View style={[styles.card, styles.sectionEmerald, cardShadow]}>
              <View style={styles.sectionHead}>
                <View style={[styles.sectionIconWrap, styles.iconWrapEmerald]}>
                  <Text style={styles.sectionEmoji}>📲</Text>
                </View>
                <View style={styles.sectionHeadText}>
                  <Text style={styles.sectionTitle}>App update broadcast</Text>
                  <Text style={styles.sectionHint}>
                    Push an update alert to every user. They get a notification and a blocking screen with a Play Store button.
                  </Text>
                </View>
              </View>

              {currentUpdateAlert?.active ? (
                <View style={styles.updateStatusBox}>
                  <Text style={styles.updateStatusTitle}>Alert is LIVE</Text>
                  <Text style={styles.updateStatusText}>
                    {String(currentUpdateAlert.title || 'Update Huzz')}
                  </Text>
                  <Text style={styles.updateStatusMeta}>
                    Sent to {currentUpdateAlert.pushSentCount ?? 0} devices ·{' '}
                    {formatTimestamp(currentUpdateAlert.createdAt)}
                  </Text>
                </View>
              ) : (
                <View style={[styles.updateStatusBox, styles.updateStatusIdle]}>
                  <Text style={styles.updateStatusTitle}>No active alert</Text>
                  <Text style={styles.updateStatusText}>Users can use the app normally.</Text>
                </View>
              )}

              <Text style={styles.label}>Notification title</Text>
              <TextInput
                style={styles.input}
                value={updateAlertTitle}
                onChangeText={setUpdateAlertTitle}
                placeholder="Update Huzz"
              />

              <Text style={styles.label}>Message</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={updateAlertBody}
                onChangeText={setUpdateAlertBody}
                placeholder="Tell users why they should update..."
                multiline
              />

              <Text style={styles.label}>Minimum version (optional)</Text>
              <TextInput
                style={styles.input}
                value={updateAlertMinVersion}
                onChangeText={setUpdateAlertMinVersion}
                placeholder="e.g. 1.0.2 — leave blank to alert everyone"
                autoCapitalize="none"
              />

              <Text style={styles.sectionHint}>
                Play Store: {PLAY_STORE_WEB_URL}
              </Text>

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnEmerald, broadcastingUpdate && styles.actionBtnDisabled]}
                onPress={handleBroadcastAppUpdate}
                disabled={broadcastingUpdate}
              >
                {broadcastingUpdate ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionText}>Send update alert to all users</Text>
                )}
              </TouchableOpacity>

              {currentUpdateAlert?.active ? (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnNeutral, clearingUpdate && styles.actionBtnDisabled]}
                  onPress={handleClearAppUpdate}
                  disabled={clearingUpdate}
                >
                  {clearingUpdate ? (
                    <ActivityIndicator color="#0f172a" />
                  ) : (
                    <Text style={styles.actionTextDark}>Clear alert (stop blocking users)</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          )}

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
              <AdminUserDirectory cardShadow={cardShadow} />
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

                    <View style={styles.warningActionBox}>
                      <Text style={styles.reportInsightTitle}>Warning + evidence tools</Text>
                      <Text style={styles.reportInsightText}>
                        Open the warning composer to write the email, choose a template, and decide whether to attach the CSV.
                      </Text>
                      {lastEvidenceMeta ? (
                        <Text style={styles.timelineMeta}>
                          Last generated: {lastEvidenceMeta.filename} ({lastEvidenceMeta.rowCount} rows)
                        </Text>
                      ) : null}
                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnNeutral]}
                          onPress={generateEvidenceCsv}
                          disabled={warningActionLoading}
                        >
                          <Text style={styles.actionText}>
                            {warningActionLoading ? 'Working...' : 'Generate evidence CSV'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnSky]}
                          onPress={() =>
                            openWarningComposer({
                              targetUid: selectedSafetyProfile.uid,
                              targetName: selectedSafetyProfile.userName || '',
                              reportId: resolveEvidenceContext().reportId,
                              matchId: resolveEvidenceContext().matchId,
                              templateKey: warningTemplateKey,
                              referenceNotes: warningReferenceNotes,
                            })
                          }
                          disabled={warningActionLoading}
                        >
                          <Text style={styles.actionText}>Send warning</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnRose]}
                          onPress={() => sendModerationEmail('suspension')}
                          disabled={warningActionLoading}
                        >
                          <Text style={styles.actionText}>Suspend + send final email</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnAmber]}
                          onPress={() => sendModerationEmail('device_ban')}
                          disabled={warningActionLoading}
                        >
                          <Text style={styles.actionText}>Ban device + send final email</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

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
                  safetyProfiles.map((profile) => {
                    const safetyUser = getUserCardData(profile.uid);
                    return (
                    <View key={profile.uid || profile.id} style={[styles.reportCard, cardShadow]}>
                      <View style={styles.safetyCardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.reportTitle}>USER SAFETY</Text>
                          <Text style={styles.safetyUserName}>
                            {safetyUser?.name || profile.userName || profile.uid || 'Unknown user'}
                          </Text>
                          {safetyUser ? (
                            <>
                              <Text style={styles.reportMeta}>{safetyUser.email}</Text>
                              <Text style={styles.reportMeta}>Phone: {safetyUser.phone}</Text>
                            </>
                          ) : null}
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
                    );
                  })
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
                {vulgarAttempts.map((a) => {
                  const blockedUser = getUserCardData(a.userId);
                  const targetSafety = a.userId ? safetyProfilesByUid[String(a.userId)] : null;
                  const matchData = a.matchId ? matchesById[String(a.matchId)] : null;
                  const matchUsers = Array.isArray(matchData?.uids)
                    ? matchData.uids.map((uid) => getUserCardData(uid)).filter(Boolean)
                    : [];
                  return (
                <View key={a.id} style={[styles.reportCard, cardShadow]}>
                  <View style={styles.safetyCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportTitle}>BLOCKED MESSAGE</Text>
                      <Text style={styles.reportMeta}>Status: {String(a.status || 'blocked').toUpperCase()}</Text>
                    </View>
                    {targetSafety ? (
                      <View
                        style={[
                          styles.riskBadge,
                          targetSafety.riskLevel === 'restricted'
                            ? styles.riskBadgeRestricted
                            : targetSafety.riskLevel === 'review'
                              ? styles.riskBadgeReview
                              : targetSafety.riskLevel === 'watch'
                                ? styles.riskBadgeWatch
                                : styles.riskBadgeClear,
                        ]}
                      >
                        <Text style={styles.riskBadgeText}>
                          {(targetSafety.riskLevel || 'clear').toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.relationshipPanel}>
                    {renderUserMiniCard('Blocked user', blockedUser)}
                    {a.matchId ? (
                      <View style={[styles.personRow, styles.personRowSubtle]}>
                        <Text style={styles.personLabel}>Match</Text>
                        <View style={styles.matchContextWrap}>
                          <Text style={styles.personName}>
                            {matchUsers.length ? matchUsers.map((user) => user.name).join(' + ') : shortId(a.matchId)}
                          </Text>
                          <Text style={styles.personMeta}>Match ID: {shortId(a.matchId)}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                  {targetSafety ? (
                    <View style={styles.reportInsightBox}>
                      <Text style={styles.reportInsightTitle}>Repeat-offender context</Text>
                      <Text style={styles.reportInsightText}>
                        {targetSafety.currentReasons?.length
                          ? targetSafety.currentReasons.join(' • ')
                          : `${targetSafety.recentFlags30d || 0} recent flags in the last 30 days.`}
                      </Text>
                    </View>
                  ) : null}
                  {a.originalMessage ? (
                    <Text style={styles.details}>Original: “{String(a.originalMessage).slice(0, 300)}”</Text>
                  ) : null}
                  {a.createdAt ? (
                    <Text style={styles.timelineMeta}>
                      {new Date(a.createdAt).toLocaleString()} · Attempt ID: {shortId(a.id)}
                    </Text>
                  ) : null}
                  {a.userId ? (
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnSky]}
                        onPress={() =>
                          openWarningComposer({
                            targetUid: a.userId,
                            targetName: blockedUser?.name || '',
                            matchId: a.matchId || '',
                            templateKey: 'profanity',
                            referenceNotes: `Blocked profanity attempt ${shortId(a.id)}`,
                          })
                        }
                        disabled={warningActionLoading}
                      >
                        <Text style={styles.actionText}>Send warning</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnSky]}
                        onPress={() => {
                          setTab('safety');
                          openSafetyProfile(a.userId, { matchId: a.matchId || '' });
                        }}
                      >
                        <Text style={styles.actionText}>Open safety profile</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
              })}
              </>
            )
          ) : tab === 'verifications' ? (
            verifs.length === 0 ? (
              <View style={[styles.card, styles.sectionEmerald, styles.emptyBox, cardShadow]}>
                <Text style={styles.emptyTitle}>No verification requests</Text>
                <Text style={styles.emptyText}>You’re all caught up.</Text>
              </View>
            ) : (
              verifs.map((v) => {
                const verUser = getUserCardData(v.uid);
                return (
                <View key={v.id} style={[styles.reportCard, cardShadow]}>
                  <Text style={styles.reportTitle}>VERIFICATION</Text>
                  <Text style={styles.reportMeta}>Submitted: {formatTimestamp(v.createdAt)}</Text>
                  {verUser ? renderUserMiniCard('User', verUser, { subtle: true }) : (
                    <Text style={styles.reportMeta}>User UID: {v.uid || '—'}</Text>
                  )}
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
                );
              })
            )
          ) : reports.length === 0 ? (
            <View style={[styles.card, styles.sectionRose, styles.emptyBox, cardShadow]}>
              <Text style={styles.emptyTitle}>No open reports</Text>
              <Text style={styles.emptyText}>You’re all caught up.</Text>
            </View>
          ) : (
            reports.map((r) => {
              const resolvedTargetUid =
                r.targetUserId ||
                messageAuthorByReportId[r.id] ||
                (r.targetType === 'user' ? r.targetId : null);
              const reporterUser = getUserCardData(r.reporterUid);
              const targetUser = getUserCardData(resolvedTargetUid);
              const targetSafety = resolvedTargetUid ? safetyProfilesByUid[String(resolvedTargetUid)] : null;
              const matchData = r.matchId ? matchesById[String(r.matchId)] : null;
              const matchUsers = Array.isArray(matchData?.uids)
                ? matchData.uids.map((uid) => getUserCardData(uid)).filter(Boolean)
                : [];
              const inferredReporterUser =
                reporterUser?.hasResolvedProfile
                  ? reporterUser
                  : matchUsers.find((user) => user?.uid && user.uid !== resolvedTargetUid) || reporterUser;
              const inferredTargetUser =
                targetUser?.hasResolvedProfile
                  ? targetUser
                  : matchUsers.find((user) => user?.uid && user.uid === resolvedTargetUid) || targetUser;
              const templateKey = inferWarningTemplate({
                categories: r.categories,
                reason: r.reason,
              });

              return (
              <View key={r.id} style={[styles.reportCard, cardShadow]}>
                <View style={styles.safetyCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reportTitle}>{String(r.targetType || 'report').toUpperCase()}</Text>
                    <Text style={styles.reportMeta}>Reported: {formatTimestamp(r.createdAt)}</Text>
                    <Text style={styles.reportMeta}>Reason: {r.reason || '-'}</Text>
                    <Text style={styles.reportMeta}>
                      Categories: {Array.isArray(r.categories) && r.categories.length ? r.categories.join(', ') : '-'}
                    </Text>
                  </View>
                  {targetSafety ? (
                    <View
                      style={[
                        styles.riskBadge,
                        targetSafety.riskLevel === 'restricted'
                          ? styles.riskBadgeRestricted
                          : targetSafety.riskLevel === 'review'
                            ? styles.riskBadgeReview
                            : targetSafety.riskLevel === 'watch'
                              ? styles.riskBadgeWatch
                              : styles.riskBadgeClear,
                      ]}
                    >
                      <Text style={styles.riskBadgeText}>
                        {(targetSafety.riskLevel || 'clear').toUpperCase()}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.relationshipPanel}>
                  {renderUserMiniCard('Reporter', inferredReporterUser)}
                  {renderUserMiniCard('Target', inferredTargetUser)}
                  {r.matchId ? (
                    <View style={[styles.personRow, styles.personRowSubtle]}>
                      <Text style={styles.personLabel}>Match</Text>
                      <View style={styles.matchContextWrap}>
                        {matchUsers.length ? (
                          matchUsers.map((mu) => (
                            <View key={mu.uid} style={{ marginBottom: 6 }}>
                              <Text style={styles.personName}>{mu.name}</Text>
                              <Text style={styles.personDetail}>{mu.email}</Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.personName}>Match participants loading…</Text>
                        )}
                        <Text style={styles.personMeta}>Match ID: {r.matchId}</Text>
                        <Text style={styles.personMeta}>Report ID: {r.id}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                {targetSafety ? (
                  <View style={styles.reportInsightBox}>
                    <Text style={styles.reportInsightTitle}>Repeat-offender context</Text>
                    <Text style={styles.reportInsightText}>
                      {targetSafety.currentReasons?.length
                        ? targetSafety.currentReasons.join(' • ')
                        : `${targetSafety.recentFlags30d || 0} recent flags in the last 30 days.`}
                    </Text>
                  </View>
                ) : null}

                {r.autoFlagged ? <Text style={styles.badge}>AUTO-FLAGGED</Text> : null}
                {r.details ? <Text style={styles.details}>Message: “{String(r.details)}”</Text> : null}
                <Text style={styles.timelineMeta}>
                  Opened {formatTimestamp(r.createdAt)}
                  {r.status ? ` · Status: ${String(r.status).toUpperCase()}` : ''}
                </Text>

                <Text style={styles.reportMeta}>Ban reason templates (drafts reporter note)</Text>
                <View style={styles.templateRow}>
                  {BAN_REASON_TEMPLATES.map((tpl) => (
                    <TouchableOpacity
                      key={tpl.key}
                      style={styles.templateChip}
                      onPress={() =>
                        setOutcomeDrafts((prev) => ({
                          ...prev,
                          [r.id]: tpl.outcome,
                        }))
                      }
                    >
                      <Text style={styles.templateChipText}>{tpl.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.reportMeta}>Notify reporter (email + in-app, no target details)</Text>
                <TextInput
                  style={styles.outcomeInput}
                  multiline
                  placeholder="We reviewed your report. Thank you for helping keep Wasl safe."
                  placeholderTextColor="#94a3b8"
                  value={
                    outcomeDrafts[r.id] ??
                    'We reviewed your report. Thank you for helping keep Wasl safe. We cannot share details about other accounts, but your report was helpful.'
                  }
                  onChangeText={(t) =>
                    setOutcomeDrafts((prev) => ({
                      ...prev,
                      [r.id]: t,
                    }))
                  }
                />
                {r.outcomeEmailSent || r.outcomeNotificationSent ? (
                  <Text style={styles.reportMeta}>
                    Outcome sent
                    {r.outcomeEmailSent && r.outcomeEmailTo ? ` · email ${r.outcomeEmailTo}` : ''}
                    {r.outcomeNotificationSent ? ' · in-app' : ''}
                    {r.outcomePushSent ? ' · push' : ''}
                  </Text>
                ) : null}

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnSky]}
                    onPress={async () => {
                      const message = String(
                        outcomeDrafts[r.id] ||
                          'We reviewed your report. Thank you for helping keep Wasl safe. We cannot share details about other accounts, but your report was helpful.'
                      ).trim();
                      if (!message) {
                        Alert.alert('Message required', 'Write what you want the reporter to read.');
                        return;
                      }
                      const res = await privacyAdminService.sendReportOutcomeEmail({
                        reportId: r.id,
                        message,
                      });
                      if (res.error) Alert.alert('Notify failed', res.error);
                      else {
                        const bits = [];
                        if (res.data?.emailSent) bits.push('email');
                        if (res.data?.notificationId) bits.push('in-app');
                        if (res.data?.pushSent) bits.push('push');
                        Alert.alert('Sent', bits.length ? `Notified via ${bits.join(' + ')}.` : 'Outcome recorded.');
                        load();
                      }
                    }}
                  >
                    <Text style={styles.actionText}>Notify reporter</Text>
                  </TouchableOpacity>
                  {resolvedTargetUid ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnSky]}
                      onPress={() =>
                        openWarningComposer({
                          targetUid: resolvedTargetUid,
                          targetName: targetUser?.name || '',
                          reportId: r.id,
                          matchId: r.matchId || '',
                          templateKey,
                          referenceNotes: `Report ${shortId(r.id)}`,
                        })
                      }
                      disabled={warningActionLoading}
                    >
                      <Text style={styles.actionText}>Send warning</Text>
                    </TouchableOpacity>
                  ) : null}

                  {(r.targetType === 'user' || (r.targetType === 'message' && resolvedTargetUid)) && (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnRose]}
                      onPress={() => {
                        const runDisable = async (tpl) => {
                          if (tpl) {
                            setOutcomeDrafts((prev) => ({ ...prev, [r.id]: tpl.outcome }));
                          }
                          const uid = r.targetType === 'user' ? r.targetId : resolvedTargetUid;
                          const { error } = await adminService.setUserDisabled(uid, true);
                          if (error) Alert.alert('Error', error);
                          else {
                            Alert.alert(
                              'Disabled',
                              tpl
                                ? `Account disabled (${tpl.disableReason}). Reporter note drafted — tap Notify reporter when ready.`
                                : 'Account disabled. Draft a reporter note with a template chip, then Notify reporter.'
                            );
                          }
                        };
                        Alert.alert(
                          'Disable account?',
                          'Optionally apply a ban-reason template that drafts the reporter note.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Disable only',
                              style: 'destructive',
                              onPress: () => runDisable(null),
                            },
                            {
                              text: 'Pick reason',
                              onPress: () => {
                                Alert.alert('Ban reason', 'Drafts the reporter outcome note.', [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: 'Harassment',
                                    onPress: () => runDisable(BAN_REASON_TEMPLATES[0]),
                                  },
                                  {
                                    text: 'More…',
                                    onPress: () => {
                                      Alert.alert('Ban reason', '', [
                                        { text: 'Cancel', style: 'cancel' },
                                        {
                                          text: 'Sexual',
                                          onPress: () => runDisable(BAN_REASON_TEMPLATES[1]),
                                        },
                                        {
                                          text: 'More…',
                                          onPress: () => {
                                            Alert.alert('Ban reason', '', [
                                              { text: 'Cancel', style: 'cancel' },
                                              {
                                                text: 'Spam / scam',
                                                onPress: () => runDisable(BAN_REASON_TEMPLATES[2]),
                                              },
                                              {
                                                text: 'More…',
                                                onPress: () => {
                                                  Alert.alert('Ban reason', '', [
                                                    { text: 'Cancel', style: 'cancel' },
                                                    {
                                                      text: 'Underage',
                                                      onPress: () => runDisable(BAN_REASON_TEMPLATES[3]),
                                                    },
                                                    {
                                                      text: 'Reviewed',
                                                      onPress: () => runDisable(BAN_REASON_TEMPLATES[4]),
                                                    },
                                                  ]);
                                                },
                                              },
                                            ]);
                                          },
                                        },
                                      ]);
                                    },
                                  },
                                ]);
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Text style={styles.actionText}>Disable + draft note</Text>
                    </TouchableOpacity>
                  )}

                  {resolvedTargetUid ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnAmber]}
                      onPress={async () => {
                        Alert.alert('Ban device?', 'This blocks sign-in from the same device (soft gate).', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Ban device',
                            style: 'destructive',
                            onPress: async () => {
                              const res = await userService.getUserById(resolvedTargetUid);
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

                  {resolvedTargetUid ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnSky]}
                      onPress={() => {
                        setTab('safety');
                        openSafetyProfile(resolvedTargetUid, { reportId: r.id, matchId: r.matchId || '' });
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
            );
            })
          )}
        </HuzzKeyboardAwareScrollView>
      )}
    </SafeAreaView>
    <Modal
      visible={warningComposer.visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={closeWarningComposer}
    >
      <SafeAreaView style={styles.warningModalScreen} edges={['top', 'bottom']}>
        <View style={styles.warningModalCard}>
          <View style={[styles.warningModalHeader, { paddingTop: insets.top + 10 }]}>
            <View style={styles.warningModalHeaderContent}>
              <Text style={styles.warningModalEyebrow}>HUZZ WARNING</Text>
              <Text style={styles.warningModalTitle}>
                {warningComposer.targetName || shortId(warningComposer.targetUid)}
              </Text>
              <View style={styles.warningModalUnderline} />
              <Text style={styles.warningModalHint}>
                Pick a template, write the warning, and choose whether to attach the evidence CSV.
              </Text>
            </View>
            <TouchableOpacity style={[styles.warningModalClose, { top: insets.top + 10 }]} onPress={closeWarningComposer}>
              <Text style={styles.warningModalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>

          <HuzzKeyboardAwareScrollView
            style={styles.warningModalScroll}
            contentContainerStyle={styles.warningModalContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Warning template</Text>
            <View style={styles.templateRow}>
              {WARNING_TEMPLATE_OPTIONS.map((template) => (
                <TouchableOpacity
                  key={template.id}
                  style={[
                    styles.statusPill,
                    warningTemplateKey === template.id ? styles.statusPillOn : null,
                  ]}
                  onPress={() => setWarningTemplateKey(template.id)}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      warningTemplateKey === template.id ? styles.statusPillTextOn : null,
                    ]}
                  >
                    {template.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>References / internal notes</Text>
            <TextInput
              style={[styles.input, styles.notesInputSmall]}
              placeholder="Policy refs, ticket refs, report refs, or moderation notes"
              value={warningReferenceNotes}
              onChangeText={setWarningReferenceNotes}
              multiline
            />

            <Text style={styles.label}>Warning message</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="Write the message the user should receive"
              value={warningCustomMessage}
              onChangeText={setWarningCustomMessage}
              multiline
            />

            <TouchableOpacity
              style={[styles.attachToggle, warningAttachCsv ? styles.attachToggleOn : null]}
              onPress={() => setWarningAttachCsv((value) => !value)}
            >
              <View style={[styles.attachCheck, warningAttachCsv ? styles.attachCheckOn : null]}>
                {warningAttachCsv ? <Text style={styles.attachCheckText}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.attachToggleTitle}>Attach evidence CSV</Text>
                <Text style={styles.attachToggleHint}>
                  Turn this off if you want to send only the warning email without the CSV attachment.
                </Text>
              </View>
            </TouchableOpacity>

            {lastEvidenceMeta ? (
              <Text style={styles.timelineMeta}>
                Last generated: {lastEvidenceMeta.filename} ({lastEvidenceMeta.rowCount} rows)
              </Text>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnNeutral]}
                onPress={generateEvidenceCsv}
                disabled={warningActionLoading}
              >
                <Text style={styles.actionText}>
                  {warningActionLoading ? 'Working...' : 'Generate evidence CSV'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSky]}
                onPress={() => sendModerationEmail('warning', { includeEvidence: warningAttachCsv })}
                disabled={warningActionLoading}
              >
                <Text style={styles.actionText}>
                  {warningAttachCsv ? 'Send warning' : 'Send warning only'}
                </Text>
              </TouchableOpacity>
            </View>
          </HuzzKeyboardAwareScrollView>
        </View>
      </SafeAreaView>
    </Modal>
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
  outcomeInput: {
    marginTop: 8,
    minHeight: 72,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
    color: '#0f172a',
    textAlignVertical: 'top',
    fontSize: 13,
  },
  templateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  templateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#e0f2fe',
  },
  templateChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
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
  relationshipPanel: {
    marginTop: 12,
    padding: 12,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    gap: 10,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  personRowSubtle: {
    alignItems: 'flex-start',
  },
  personLabel: {
    width: 64,
    fontSize: 12,
    fontWeight: '800',
    color: tokens.colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  personAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: tokens.colors.surfaceElevated,
  },
  personAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  personAvatarLetter: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.colors.text,
  },
  personTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  personDetail: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
    lineHeight: 18,
  },
  personMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textMuted,
  },
  matchContextWrap: {
    flex: 1,
    minWidth: 0,
    paddingTop: 8,
  },
  reportInsightBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.accentDim,
    borderWidth: 1,
    borderColor: tokens.colors.accent,
  },
  reportInsightTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.colors.accent,
    letterSpacing: 0.4,
  },
  reportInsightText: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colors.text,
    lineHeight: 18,
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
  templateRow: {
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
  notesInputSmall: {
    minHeight: 68,
    textAlignVertical: 'top',
  },
  warningActionBox: {
    marginTop: 12,
    marginBottom: 12,
    padding: 12,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.filterBgAmber,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderAmber,
  },
  warningModalScreen: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
  },
  warningModalCard: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
    overflow: 'hidden',
  },
  warningModalHeader: {
    position: 'relative',
    paddingHorizontal: tokens.spacing.md,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: '#FFF7F8',
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    alignItems: 'center',
  },
  warningModalHeaderContent: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 44,
  },
  warningModalEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E11D48',
    letterSpacing: 0.8,
  },
  warningModalTitle: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '800',
    color: '#1c1917',
  },
  warningModalUnderline: {
    marginTop: 6,
    width: 92,
    height: 3,
    borderRadius: 99,
    backgroundColor: '#2563EB',
  },
  warningModalHint: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
  },
  warningModalClose: {
    position: 'absolute',
    right: tokens.spacing.md,
    top: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  warningModalCloseText: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.colors.text,
  },
  warningModalScroll: {
    flex: 1,
  },
  warningModalContent: {
    padding: tokens.spacing.md,
    gap: 12,
    paddingBottom: tokens.spacing.xl + 40,
  },
  attachToggle: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  attachToggleOn: {
    backgroundColor: tokens.colors.accentDim,
    borderColor: tokens.colors.accent,
  },
  attachCheck: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    backgroundColor: tokens.colors.surface,
  },
  attachCheckOn: {
    backgroundColor: tokens.colors.accent,
    borderColor: tokens.colors.accent,
  },
  attachCheckText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  attachToggleTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.colors.text,
  },
  attachToggleHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
    lineHeight: 17,
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
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  updateStatusBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderEmerald,
    borderRadius: tokens.radius.md,
    padding: 12,
    marginBottom: 14,
  },
  updateStatusIdle: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: tokens.colors.border,
  },
  updateStatusTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.colors.text,
    marginBottom: 4,
  },
  updateStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
    lineHeight: 20,
  },
  updateStatusMeta: {
    fontSize: 12,
    color: tokens.colors.textMuted,
    marginTop: 6,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionTextDark: {
    fontWeight: '700',
    color: tokens.colors.text,
    fontSize: 13,
  },
});


