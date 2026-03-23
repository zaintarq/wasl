import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput } from 'react-native';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import { adminService, authService, deviceBanService, userService, verificationService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';

export function AdminScreen({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reports, setReports] = useState([]);
  const [verifs, setVerifs] = useState([]);
  const [tab, setTab] = useState('reports'); // 'reports' | 'verifications' | 'users' | 'vulgar'
  const [vulgarAttempts, setVulgarAttempts] = useState([]);
  const [vulgarLoading, setVulgarLoading] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createUserEmail, setCreateUserEmail] = useState('');
  const [createUserPassword, setCreateUserPassword] = useState('');
  const [createUserName, setCreateUserName] = useState('');
  const [createUserRole, setCreateUserRole] = useState('user'); // 'user' | 'staff'
  const [creatingUser, setCreatingUser] = useState(false);

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
      const res = await adminService.listReports({ status: 'open', limitCount: 50 });
      setReports(res?.data || []);
      const vres = await verificationService.list({ status: 'submitted', limitCount: 50 });
      setVerifs(vres?.data || []);
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={{ width: 50 }} />
        <Text style={styles.title}>Admin</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerBtn} onPress={load}>
            <Text style={styles.headerBtnText}>↻</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => onNavigate('settings')}>
            <Text style={styles.headerBtnText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 12, fontWeight: 'bold' }}>Loading reports...</Text>
        </View>
      ) : !isAdmin ? (
        <View style={{ padding: 16 }}>
          <Text style={styles.warnTitle}>Admin only</Text>
          <Text style={styles.warnText}>
            Add this user to the `admin` collection with `role: 'admin'` in Firestore, then reload.
            {'\n\n'}Run: node scripts/addAdminToCollection.js {'{userId}'} admin {'{email}'} {'{name}'}
          </Text>
        </View>
      ) : (
        <HuzzKeyboardAwareScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'reports' ? styles.tabBtnOn : null]}
              onPress={() => setTab('reports')}
            >
              <Text style={styles.tabText}>Reports</Text>
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
              onPress={() => {
                setTab('vulgar');
                if (vulgarAttempts.length === 0 && !vulgarLoading) {
                  setVulgarLoading(true);
                  adminService.listVulgarAttempts({ limitCount: 100 })
                    .then((res) => { setVulgarAttempts(res?.data || []); })
                    .catch(() => setVulgarAttempts([]))
                    .finally(() => setVulgarLoading(false));
                }
              }}
            >
              <Text style={styles.tabText}>Chat safety</Text>
            </TouchableOpacity>
          </View>

          {tab === 'users' && (
            <View style={styles.userManagementBox}>
              <Text style={styles.sectionTitle}>User Management</Text>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#90ee90', borderColor: '#228b22' }]}
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
                      style={[styles.actionBtn, { backgroundColor: '#90ee90', borderColor: '#228b22' }]}
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
                      style={[styles.actionBtn, { backgroundColor: '#cccccc', borderColor: '#654321' }]}
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

          {tab === 'vulgar' ? (
            vulgarLoading ? (
              <View style={styles.emptyBox}>
                <ActivityIndicator />
                <Text style={styles.emptyTitle}>Loading...</Text>
              </View>
            ) : vulgarAttempts.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No vulgar attempts</Text>
                <Text style={styles.emptyText}>Blocked chat messages will appear here.</Text>
                <TouchableOpacity
                  style={[styles.actionBtn, { marginTop: 12 }]}
                  onPress={() => {
                    setVulgarLoading(true);
                    adminService.listVulgarAttempts({ limitCount: 100 })
                      .then((res) => setVulgarAttempts(res?.data || []))
                      .finally(() => setVulgarLoading(false));
                  }}
                >
                  <Text style={styles.actionText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, { alignSelf: 'flex-start', marginBottom: 8 }]}
                  onPress={() => {
                    setVulgarLoading(true);
                    adminService.listVulgarAttempts({ limitCount: 100 })
                      .then((res) => setVulgarAttempts(res?.data || []))
                      .finally(() => setVulgarLoading(false));
                  }}
                >
                  <Text style={styles.actionText}>Refresh</Text>
                </TouchableOpacity>
                {vulgarAttempts.map((a) => (
                <View key={a.id} style={styles.reportCard}>
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
                </View>
              ))}
              </>
            )
          ) : tab === 'verifications' ? (
            verifs.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No verification requests</Text>
                <Text style={styles.emptyText}>You’re all caught up.</Text>
              </View>
            ) : (
              verifs.map((v) => (
                <View key={v.id} style={styles.reportCard}>
                  <Text style={styles.reportTitle}>VERIFICATION</Text>
                  <Text style={styles.reportMeta}>User: {v.uid}</Text>
                  <Text style={styles.reportMeta}>Language: {v.language || '-'}</Text>
                  <Text style={styles.reportMeta}>Status: {String(v.status || '').toUpperCase()}</Text>
                  {v.transcript ? <Text style={styles.details}>“{String(v.transcript).slice(0, 220)}”</Text> : null}
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#87ceeb', borderColor: '#4682b4' }]}
                      onPress={() => {
                        const url = String(v.selfieUrl || '');
                        if (url) Linking.openURL(url);
                        else Alert.alert('Missing', 'No selfie URL found.');
                      }}
                    >
                      <Text style={styles.actionText}>Open selfie</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#87ceeb', borderColor: '#4682b4' }]}
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
                      style={[styles.actionBtn, { backgroundColor: '#90ee90', borderColor: '#228b22' }]}
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
                      style={[styles.actionBtn, { backgroundColor: '#ff6b6b' }]}
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
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No open reports</Text>
              <Text style={styles.emptyText}>You’re all caught up.</Text>
            </View>
          ) : (
            reports.map((r) => (
              <View key={r.id} style={styles.reportCard}>
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
                      style={[styles.actionBtn, { backgroundColor: '#ff6b6b' }]}
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
                      style={[styles.actionBtn, { backgroundColor: '#ffff00' }]}
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

                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#90ee90', borderColor: '#228b22' }]}
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 3,
    borderColor: '#654321',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnText: { fontWeight: '900', color: '#000000' },
  title: { fontSize: 18, fontWeight: '900', color: '#8b4513', letterSpacing: 1 },
  warnTitle: { fontSize: 16, fontWeight: '900', color: '#800020', marginBottom: 8 },
  warnText: { fontWeight: 'bold', color: '#000000' },
  emptyBox: { backgroundColor: '#ffffff', borderWidth: 3, borderColor: '#8b4513', borderRadius: 12, padding: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#8b4513', marginBottom: 6 },
  emptyText: { fontWeight: 'bold', color: '#000000' },
  tabs: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 3,
    borderColor: '#654321',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  tabBtnOn: { backgroundColor: '#90ee90', borderColor: '#228b22' },
  tabText: { fontWeight: '900', color: '#000000', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11 },
  reportCard: {
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#654321',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  reportTitle: { fontSize: 12, fontWeight: '900', color: '#800020', letterSpacing: 1 },
  reportMeta: { marginTop: 4, fontSize: 12, fontWeight: 'bold', color: '#000000' },
  badge: { marginTop: 8, fontSize: 11, fontWeight: '900', color: '#800020', letterSpacing: 1 },
  details: { marginTop: 8, fontSize: 12, fontWeight: 'bold', color: '#000000' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#654321',
  },
  actionText: { fontWeight: '900', color: '#000000', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11 },
  userManagementBox: {
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#654321',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#8b4513',
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  createUserForm: {
    marginTop: 12,
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#654321',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#000000',
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
    borderWidth: 2,
    borderColor: '#654321',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  roleBtnSelected: {
    backgroundColor: '#90ee90',
    borderColor: '#228b22',
  },
  roleBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
    textTransform: 'uppercase',
  },
  roleBtnTextSelected: {
    color: '#000000',
  },
  hintText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#800020',
    fontStyle: 'italic',
    marginTop: 4,
  },
  createUserActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
});


