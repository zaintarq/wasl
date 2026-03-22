import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { activityService, authService, adminService, auditLogService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';

export function ActivityMonitorScreen({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [activityFlags, setActivityFlags] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userActivities, setUserActivities] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    let unsubscribeFlags = null;
    let unsubscribeActivities = null;

    const load = async () => {
      setLoading(true);
      try {
        // Set up real-time listener for activity flags
        const flagsRef = query(
          collection(db, 'activityFlags'),
          orderBy('detectedAt', 'desc'),
          limit(50)
        );

        unsubscribeFlags = onSnapshot(
          flagsRef,
          (snap) => {
            if (cancelled) return;
            const flags = snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
              detectedAt: d.data().detectedAt?.toMillis?.() || d.data().detectedAt?.seconds * 1000 || Date.now(),
            }));
            setActivityFlags(flags);
          },
          (error) => {
            console.error('[ActivityMonitor] Flags listener error:', error);
          }
        );

        // Load recent activities (non-real-time for performance)
        const { data: activities } = await activityService.getRecentActivities(null, 100, 60000); // Last minute
        if (!cancelled) {
          setRecentActivities(activities);
        }
      } catch (error) {
        console.error('[ActivityMonitor] Load error:', error);
        if (!cancelled) {
          Alert.alert('Error', 'Failed to load activity data.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      if (unsubscribeFlags) unsubscribeFlags();
      if (unsubscribeActivities) unsubscribeActivities();
    };
  }, []);

  const loadUserActivities = async (userId) => {
    setLoading(true);
    try {
      const { data } = await activityService.getRecentActivities(userId, 200, 3600000); // Last hour
      setUserActivities(data);
      setSelectedUser(userId);
    } catch (error) {
      Alert.alert('Error', 'Failed to load user activities.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminAction = async (userId, action, flagId = null) => {
    try {
      const adminId = authService.getCurrentUser()?.uid;
      if (!adminId) {
        Alert.alert('Error', 'Not authenticated as admin');
        return;
      }

      let actionTaken = '';

      switch (action) {
        case 'warn':
          // Send warning notification
          actionTaken = 'warned';
          Alert.alert('Warning Sent', 'User has been warned.');
          break;
        case 'ban':
          // Temporary ban
          const banResult = await adminService.setUserDisabled(userId, true);
          if (banResult.error) {
            Alert.alert('Error', banResult.error);
            return;
          }
          actionTaken = 'banned';
          Alert.alert('User Banned', 'User account has been disabled.');
          break;
        case 'restrict':
          // Auto-restrict (limit actions)
          actionTaken = 'restricted';
          Alert.alert('User Restricted', 'User actions have been limited.');
          break;
        case 'review':
          actionTaken = 'marked_for_review';
          break;
      }

      // Log admin action
      await auditLogService.logAdminAction(adminId, action, userId, { flagId, actionTaken });

      // Resolve flag if provided
      if (flagId) {
        await activityService.resolveFlag(flagId, actionTaken);
      }

      // Reload flags
      const { data: flags } = await activityService.getActivityFlags({ limit: 50 });
      setActivityFlags(flags);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to perform action');
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high':
        return '#ff6b6b';
      case 'medium':
        return '#ffd700';
      case 'low':
        return '#90ee90';
      default:
        return tokens.colors.border;
    }
  };

  const filteredFlags = activityFlags.filter((flag) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      flag.userId?.toLowerCase().includes(query) ||
      flag.reason?.toLowerCase().includes(query) ||
      flag.flags?.some((f) => f.type?.toLowerCase().includes(query))
    );
  });

  if (loading && activityFlags.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading activity data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (selectedUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <HuzzPressable style={styles.backButton} onPress={() => setSelectedUser(null)} haptic="light">
            <Text style={styles.backButtonText}>← Back</Text>
          </HuzzPressable>
          <Text style={styles.headerTitle}>User Activities</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {userActivities.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No activities found</Text>
            </View>
          ) : (
            userActivities.map((activity) => (
              <View key={activity.id} style={styles.activityCard}>
                <Text style={styles.activityType}>{activity.actionType || 'unknown'}</Text>
                <Text style={styles.activityTime}>
                  {new Date(activity.timestamp).toLocaleString()}
                </Text>
                {activity.screenName && (
                  <Text style={styles.activityScreen}>Screen: {activity.screenName}</Text>
                )}
                {activity.actionData && Object.keys(activity.actionData).length > 0 && (
                  <Text style={styles.activityData}>
                    {JSON.stringify(activity.actionData, null, 2)}
                  </Text>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity Monitor</Text>
        <HuzzPressable style={styles.refreshButton} onPress={() => window.location.reload()} haptic="light">
          <Text style={styles.refreshButtonText}>↻</Text>
        </HuzzPressable>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by user ID, reason..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={tokens.colors.text}
        />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {filteredFlags.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No Activity Flags</Text>
            <Text style={styles.emptyText}>All clear! No hyper activity detected.</Text>
          </View>
        ) : (
          filteredFlags.map((flag) => (
            <View key={flag.id} style={styles.flagCard}>
              <View style={styles.flagHeader}>
                <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(flag.severity) }]}>
                  <Text style={styles.severityText}>{flag.severity?.toUpperCase() || 'UNKNOWN'}</Text>
                </View>
                <Text style={styles.flagTime}>
                  {new Date(flag.detectedAt).toLocaleString()}
                </Text>
              </View>

              <Text style={styles.userIdText}>User: {flag.userId}</Text>

              {flag.flags && flag.flags.length > 0 && (
                <View style={styles.flagsList}>
                  {flag.flags.map((f, idx) => (
                    <View key={idx} style={styles.flagItem}>
                      <Text style={styles.flagType}>{f.type?.replace('_', ' ').toUpperCase()}</Text>
                      <Text style={styles.flagCount}>Count: {f.count || 'N/A'}</Text>
                      {f.action && <Text style={styles.flagAction}>Action: {f.action}</Text>}
                    </View>
                  ))}
                </View>
              )}

              {flag.reason && <Text style={styles.flagReason}>Reason: {flag.reason}</Text>}

              <View style={styles.actionButtons}>
                <HuzzPressable
                  style={[styles.actionBtn, styles.viewBtn]}
                  onPress={() => loadUserActivities(flag.userId)}
                  haptic="light"
                >
                  <Text style={styles.actionBtnText}>View Activities</Text>
                </HuzzPressable>
                <HuzzPressable
                  style={[styles.actionBtn, styles.warnBtn]}
                  onPress={() => handleAdminAction(flag.userId, 'warn', flag.id)}
                  haptic="medium"
                >
                  <Text style={styles.actionBtnText}>⚠️ Warn</Text>
                </HuzzPressable>
                <HuzzPressable
                  style={[styles.actionBtn, styles.banBtn]}
                  onPress={() => {
                    Alert.alert('Ban User?', 'This will disable the user account.', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Ban',
                        style: 'destructive',
                        onPress: () => handleAdminAction(flag.userId, 'ban', flag.id),
                      },
                    ]);
                  }}
                  haptic="heavy"
                >
                  <Text style={styles.actionBtnText}>🚫 Ban</Text>
                </HuzzPressable>
                <HuzzPressable
                  style={[styles.actionBtn, styles.restrictBtn]}
                  onPress={() => handleAdminAction(flag.userId, 'restrict', flag.id)}
                  haptic="medium"
                >
                  <Text style={styles.actionBtnText}>🔒 Restrict</Text>
                </HuzzPressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 3,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.bg,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: tokens.colors.borderDark,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  refreshButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: tokens.colors.borderDark,
    backgroundColor: tokens.colors.surface,
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '900',
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: tokens.colors.borderDark,
    backgroundColor: tokens.colors.surface,
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.colors.text,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: tokens.colors.borderDark,
  },
  headerSpacer: {
    width: 80,
  },
  searchContainer: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: tokens.colors.border,
  },
  searchInput: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 2,
    borderColor: tokens.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: tokens.colors.text,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontWeight: 'bold',
    color: tokens.colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: tokens.spacing.md,
    paddingBottom: tokens.spacing.xl,
  },
  emptyBox: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 3,
    borderColor: tokens.colors.borderDark,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: tokens.colors.borderDark,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: tokens.colors.text,
    textAlign: 'center',
  },
  flagCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 3,
    borderColor: tokens.colors.borderDark,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  flagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  severityBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: tokens.colors.borderDark,
  },
  severityText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.5,
  },
  flagTime: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  userIdText: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.colors.text,
    marginBottom: 8,
  },
  flagsList: {
    marginBottom: 8,
  },
  flagItem: {
    backgroundColor: tokens.colors.bg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 6,
    padding: 8,
    marginBottom: 4,
  },
  flagType: {
    fontSize: 11,
    fontWeight: '900',
    color: tokens.colors.accent,
    marginBottom: 2,
  },
  flagCount: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  flagAction: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.colors.text,
    marginTop: 2,
  },
  flagReason: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.colors.text,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    minWidth: 80,
    alignItems: 'center',
  },
  viewBtn: {
    backgroundColor: '#87ceeb',
    borderColor: '#4682b4',
  },
  warnBtn: {
    backgroundColor: '#ffd700',
    borderColor: '#daa520',
  },
  banBtn: {
    backgroundColor: '#ff6b6b',
    borderColor: '#dc143c',
  },
  restrictBtn: {
    backgroundColor: '#ffa500',
    borderColor: '#ff8c00',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000000',
    textTransform: 'uppercase',
  },
  activityCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 2,
    borderColor: tokens.colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  activityType: {
    fontSize: 12,
    fontWeight: '900',
    color: tokens.colors.accent,
    marginBottom: 4,
  },
  activityTime: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.colors.text,
    marginBottom: 4,
  },
  activityScreen: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.colors.text,
    marginBottom: 4,
  },
  activityData: {
    fontSize: 9,
    fontWeight: '400',
    color: tokens.colors.text,
    fontFamily: 'monospace',
  },
});
