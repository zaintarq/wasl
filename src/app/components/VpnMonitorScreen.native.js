import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { vpnDetectionService, userService, adminService, auditLogService, authService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { format } from 'date-fns';

export function VpnMonitorScreen({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [vpnUsers, setVpnUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [vpnHistory, setVpnHistory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all'); // 'all', 'low', 'medium', 'high'

  useEffect(() => {
    loadVpnUsers();
  }, [filterSeverity]);

  const loadVpnUsers = async () => {
    setLoading(true);
    try {
      const { data } = await vpnDetectionService.getVpnUsers({
        flagged: filterSeverity !== 'all',
        limit: 100,
      });

      // Fetch user data for each VPN user
      const usersWithData = await Promise.all(
        data.map(async (vpnData) => {
          try {
            const userRes = await userService.getUserById(vpnData.userId);
            return {
              ...vpnData,
              userName: userRes?.data?.name || 'Unknown',
              userEmail: userRes?.data?.email || '',
            };
          } catch {
            return { ...vpnData, userName: 'Unknown', userEmail: '' };
          }
        })
      );

      // Filter by severity
      let filtered = usersWithData;
      if (filterSeverity !== 'all') {
        filtered = usersWithData.filter((u) => {
          const count = u.vpnChangeCount || 0;
          if (filterSeverity === 'low') return count >= 1 && count <= 2;
          if (filterSeverity === 'medium') return count >= 3 && count <= 5;
          if (filterSeverity === 'high') return count >= 6;
          return true;
        });
      }

      setVpnUsers(filtered);
    } catch (error) {
      console.error('[VpnMonitor] Load error:', error);
      Alert.alert('Error', 'Failed to load VPN users.');
    } finally {
      setLoading(false);
    }
  };

  const loadUserVpnHistory = async (userId) => {
    setLoading(true);
    try {
      const { data } = await vpnDetectionService.getVpnHistory(userId);
      setVpnHistory(data);
      setSelectedUser(userId);
    } catch (error) {
      Alert.alert('Error', 'Failed to load VPN history.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminAction = async (userId, action) => {
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
          actionTaken = 'warned_vpn';
          Alert.alert('Warning Sent', 'User has been warned about VPN usage.');
          break;
        case 'suspend':
          // Suspend account
          const suspendResult = await adminService.setUserDisabled(userId, true);
          if (suspendResult.error) {
            Alert.alert('Error', suspendResult.error);
            return;
          }
          actionTaken = 'suspended_vpn';
          Alert.alert('User Suspended', 'User account has been suspended due to VPN usage.');
          break;
      }

      // Log admin action
      await auditLogService.logAdminAction(adminId, action, userId, {
        reason: 'vpn_usage',
        actionTaken,
      });

      // Reload users
      await loadVpnUsers();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to perform action');
    }
  };

  const getSeverity = (vpnChangeCount) => {
    if (vpnChangeCount >= 6) return { level: 'high', color: '#ff6b6b' };
    if (vpnChangeCount >= 3) return { level: 'medium', color: '#ffd700' };
    return { level: 'low', color: '#90ee90' };
  };

  const filteredUsers = vpnUsers.filter((user) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.userId?.toLowerCase().includes(query) ||
      user.userName?.toLowerCase().includes(query) ||
      user.userEmail?.toLowerCase().includes(query)
    );
  });

  if (loading && vpnUsers.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading VPN data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (selectedUser && vpnHistory) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <HuzzPressable style={styles.backButton} onPress={() => setSelectedUser(null)} haptic="light">
            <Text style={styles.backButtonText}>← Back</Text>
          </HuzzPressable>
          <Text style={styles.headerTitle}>VPN History</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Initial Location */}
          {vpnHistory.initialLocation && (
            <View style={styles.locationBox}>
              <Text style={styles.locationTitle}>Initial Location</Text>
              <Text style={styles.locationText}>
                {vpnHistory.initialLocation.city}, {vpnHistory.initialLocation.country}
              </Text>
              <Text style={styles.locationTime}>
                Detected: {format(new Date(vpnHistory.initialLocation.timestamp), 'PPpp')}
              </Text>
            </View>
          )}

          {/* Normal Location */}
          {vpnHistory.normalLocation && (
            <View style={styles.locationBox}>
              <Text style={styles.locationTitle}>Normal Location</Text>
              <Text style={styles.locationText}>
                {vpnHistory.normalLocation.city}, {vpnHistory.normalLocation.country}
              </Text>
              <Text style={styles.locationTime}>
                Consistency: {((vpnHistory.normalLocation.consistency || 0) * 100).toFixed(0)}%
              </Text>
            </View>
          )}

          {/* VPN Locations */}
          {vpnHistory.vpnLocations && vpnHistory.vpnLocations.length > 0 && (
            <View style={styles.vpnLocationsBox}>
              <Text style={styles.vpnLocationsTitle}>VPN Location Changes ({vpnHistory.vpnLocations.length})</Text>
              {vpnHistory.vpnLocations.map((vpnLoc, idx) => (
                <View key={idx} style={styles.vpnLocationCard}>
                  <View style={styles.vpnLocationHeader}>
                    <Text style={styles.vpnLocationNumber}>#{vpnLoc.vpnChangeNumber || idx + 1}</Text>
                    <Text style={styles.vpnLocationTime}>
                      {format(new Date(vpnLoc.timestamp), 'PPpp')}
                    </Text>
                  </View>
                  <View style={styles.vpnLocationRow}>
                    <Text style={styles.vpnLocationLabel}>IP Location:</Text>
                    <Text style={styles.vpnLocationValue}>
                      {vpnLoc.ipLocation?.city}, {vpnLoc.ipLocation?.country}
                    </Text>
                  </View>
                  <View style={styles.vpnLocationRow}>
                    <Text style={styles.vpnLocationLabel}>GPS Location:</Text>
                    <Text style={styles.vpnLocationValue}>
                      {vpnLoc.gpsLocation?.city}, {vpnLoc.gpsLocation?.country}
                    </Text>
                  </View>
                  <View style={styles.vpnLocationRow}>
                    <Text style={styles.vpnLocationLabel}>IP Address:</Text>
                    <Text style={styles.vpnLocationValue}>{vpnLoc.ipAddress}</Text>
                  </View>
                  {vpnLoc.activity && (
                    <View style={styles.vpnLocationRow}>
                      <Text style={styles.vpnLocationLabel}>Activity:</Text>
                      <Text style={styles.vpnLocationValue}>{vpnLoc.activity}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>VPN Monitor</Text>
        <HuzzPressable style={styles.refreshButton} onPress={loadVpnUsers} haptic="light">
          <Text style={styles.refreshButtonText}>↻</Text>
        </HuzzPressable>
      </View>

      <View style={styles.filtersContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by user ID, name, email..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={tokens.colors.text}
        />
        <View style={styles.severityFilters}>
          {['all', 'low', 'medium', 'high'].map((severity) => (
            <HuzzPressable
              key={severity}
              style={[styles.severityBtn, filterSeverity === severity && styles.severityBtnActive]}
              onPress={() => setFilterSeverity(severity)}
              haptic="light"
            >
              <Text
                style={[styles.severityBtnText, filterSeverity === severity && styles.severityBtnTextActive]}
              >
                {severity === 'all' ? 'All' : severity.charAt(0).toUpperCase() + severity.slice(1)}
              </Text>
            </HuzzPressable>
          ))}
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {filteredUsers.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No VPN Users Found</Text>
            <Text style={styles.emptyText}>All users are using their actual locations.</Text>
          </View>
        ) : (
          filteredUsers.map((user) => {
            const severity = getSeverity(user.vpnChangeCount || 0);
            return (
              <View key={user.userId} style={styles.userCard}>
                <View style={styles.userHeader}>
                  <View>
                    <Text style={styles.userName}>{user.userName || 'Unknown User'}</Text>
                    <Text style={styles.userId}>ID: {user.userId}</Text>
                    {user.userEmail && <Text style={styles.userEmail}>{user.userEmail}</Text>}
                  </View>
                  <View style={[styles.severityBadge, { backgroundColor: severity.color }]}>
                    <Text style={styles.severityBadgeText}>{severity.level.toUpperCase()}</Text>
                  </View>
                </View>

                <View style={styles.userStats}>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>VPN Changes:</Text>
                    <Text style={styles.statValue}>{user.vpnChangeCount || 0}</Text>
                  </View>
                  {user.initialLocation && (
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Initial:</Text>
                      <Text style={styles.statValue}>
                        {user.initialLocation.city}, {user.initialLocation.country}
                      </Text>
                    </View>
                  )}
                  {user.lastIpLocation && (
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Last IP:</Text>
                      <Text style={styles.statValue}>
                        {user.lastIpLocation.city}, {user.lastIpLocation.country}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.actionButtons}>
                  <HuzzPressable
                    style={[styles.actionBtn, styles.viewBtn]}
                    onPress={() => loadUserVpnHistory(user.userId)}
                    haptic="light"
                  >
                    <Text style={styles.actionBtnText}>View History</Text>
                  </HuzzPressable>
                  <HuzzPressable
                    style={[styles.actionBtn, styles.warnBtn]}
                    onPress={() => handleAdminAction(user.userId, 'warn')}
                    haptic="medium"
                  >
                    <Text style={styles.actionBtnText}>⚠️ Warn</Text>
                  </HuzzPressable>
                  <HuzzPressable
                    style={[styles.actionBtn, styles.suspendBtn]}
                    onPress={() => {
                      Alert.alert('Suspend User?', 'This will disable the user account.', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Suspend',
                          style: 'destructive',
                          onPress: () => handleAdminAction(user.userId, 'suspend'),
                        },
                      ]);
                    }}
                    haptic="heavy"
                  >
                    <Text style={styles.actionBtnText}>🚫 Suspend</Text>
                  </HuzzPressable>
                </View>
              </View>
            );
          })
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
  filtersContainer: {
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
    marginBottom: 8,
  },
  severityFilters: {
    flexDirection: 'row',
    gap: 8,
  },
  severityBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  severityBtnActive: {
    backgroundColor: tokens.colors.accent,
    borderColor: tokens.colors.borderDark,
  },
  severityBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  severityBtnTextActive: {
    color: '#ffffff',
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
  userCard: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 3,
    borderColor: tokens.colors.borderDark,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  userName: {
    fontSize: 14,
    fontWeight: '900',
    color: tokens.colors.borderDark,
    marginBottom: 4,
  },
  userId: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.colors.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  severityBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: tokens.colors.borderDark,
  },
  severityBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.5,
  },
  userStats: {
    marginBottom: 12,
    gap: 6,
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  statValue: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.colors.accent,
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
  suspendBtn: {
    backgroundColor: '#ff6b6b',
    borderColor: '#dc143c',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000000',
    textTransform: 'uppercase',
  },
  locationBox: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 2,
    borderColor: tokens.colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  locationTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: tokens.colors.accent,
    marginBottom: 6,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.colors.text,
    marginBottom: 4,
  },
  locationTime: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  vpnLocationsBox: {
    marginTop: 8,
  },
  vpnLocationsTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: tokens.colors.borderDark,
    marginBottom: 12,
  },
  vpnLocationCard: {
    backgroundColor: tokens.colors.bg,
    borderWidth: 2,
    borderColor: tokens.colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  vpnLocationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  vpnLocationNumber: {
    fontSize: 12,
    fontWeight: '900',
    color: tokens.colors.accent,
  },
  vpnLocationTime: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  vpnLocationRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  vpnLocationLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: tokens.colors.text,
    width: 100,
  },
  vpnLocationValue: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.colors.accent,
    flex: 1,
  },
});
