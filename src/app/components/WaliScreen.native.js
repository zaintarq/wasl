import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService, userService } from '../../services/firebaseService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';

export function WaliScreen({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [wards, setWards] = useState([]); // Users who added this wali

  useEffect(() => {
    loadWaliData();
  }, []);

  const loadWaliData = async () => {
    // Check if wali has been removed
    const profileRes = await userService.getUserById(currentUser.uid);
    const profile = profileRes?.data || {};
    if (profile.waliRemoved === true) {
      Alert.alert(
        'Access Revoked',
        'Your wali access has been removed by the user. You will be logged out.',
        [
          {
            text: 'OK',
            onPress: async () => {
              await authService.signOut();
              onNavigate('welcome');
            },
          },
        ]
      );
      return;
    }

    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser?.uid) {
        onNavigate('welcome');
        return;
      }

      const userRes = await userService.getUserById(currentUser.uid);
      const userData = userRes?.data;
      
      if (userData?.role !== 'wali') {
        // Not a wali, redirect to normal app
        onNavigate('home');
        return;
      }

      setUser(userData);

      // Find all users who have this wali's email
      const waliEmail = currentUser.email?.toLowerCase();
      if (waliEmail) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('wali.email', '==', waliEmail));
        const snapshot = await getDocs(q);
        const wardsList = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.wali?.email?.toLowerCase() === waliEmail) {
            wardsList.push({
              id: doc.id,
              name: data.name || 'Unknown',
              email: data.email || '',
              ...data,
            });
          }
        });
        setWards(wardsList);
      }
    } catch (error) {
      console.error('[WaliScreen] Load error:', error);
      Alert.alert('Error', 'Failed to load wali data.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.signOut();
      onNavigate('welcome');
    } catch (error) {
      Alert.alert('Error', 'Failed to logout.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Wali Dashboard</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Wards</Text>
          <Text style={styles.sectionSubtitle}>
            People who have added you as their guardian (wali)
          </Text>

          {wards.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No wards yet.</Text>
              <Text style={styles.emptySubtext}>
                When someone adds you as their wali, they will appear here.
              </Text>
            </View>
          ) : (
            wards.map((ward) => (
              <View key={ward.id} style={styles.wardCard}>
                <Text style={styles.wardName}>{ward.name || 'Unknown'}</Text>
                <Text style={styles.wardEmail}>{ward.email}</Text>
                <View style={styles.wardActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.viewButton]}
                    onPress={() => {
                      Alert.alert(
                        'Ward Details',
                        `Name: ${ward.name}\nEmail: ${ward.email}\nConsent Level: ${ward.wali?.consentLevel || 'ask'}`,
                        [{ text: 'OK' }]
                      );
                    }}
                  >
                    <Text style={styles.actionButtonText}>View Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.matchesButton]}
                    onPress={() => {
                      Alert.alert('Matches', 'View matches feature coming soon.');
                    }}
                  >
                    <Text style={styles.actionButtonText}>View Matches</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Wali Mode</Text>
          <Text style={styles.infoText}>
            As a wali (guardian), you can help oversee your wards' matches and conversations
            with their consent. You will only see information that your wards have shared with you.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: '#8b4513',
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#8b4513',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#654321',
    backgroundColor: '#ffffff',
  },
  logoutButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
    textTransform: 'uppercase',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#8b4513',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  emptyBox: {
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#8b4513',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
    textAlign: 'center',
  },
  wardCard: {
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#654321',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  wardName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000000',
    marginBottom: 4,
  },
  wardEmail: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 12,
  },
  wardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
  },
  viewButton: {
    backgroundColor: '#87ceeb',
    borderColor: '#4682b4',
  },
  matchesButton: {
    backgroundColor: '#90ee90',
    borderColor: '#228b22',
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000000',
    textTransform: 'uppercase',
  },
  infoText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
    lineHeight: 20,
    backgroundColor: '#fffef0',
    borderWidth: 2,
    borderColor: '#8b4513',
    borderRadius: 8,
    padding: 12,
  },
});
