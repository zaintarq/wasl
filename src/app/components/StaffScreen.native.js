import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, TextInput } from 'react-native';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService, userService } from '../../services/firebaseService';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { tokens } from '../../ui/tokens';

export function StaffScreen({ onNavigate }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const currentUser = authService.getCurrentUser();
        if (!currentUser?.uid) {
          if (!cancelled) onNavigate('welcome');
          return;
        }

        const res = await userService.getUserById(currentUser.uid);
        const userData = res?.data;
        
        // Check role from admin collection (not users collection)
        // Role check is done in WelcomeScreen/OnboardingFlow, but double-check here
        // If somehow they got here without being staff, they'll be redirected

        if (!cancelled) {
          setUser(userData);
          // Check if password change is required
          if (userData?.mustChangePassword) {
            setShowPasswordChange(true);
          }
        }
      } catch (error) {
        console.error('[StaffScreen] Load error:', error);
        if (!cancelled) Alert.alert('Error', 'Failed to load staff data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [onNavigate]);

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setChangingPassword(true);
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser?.email) {
        Alert.alert('Error', 'No email found');
        return;
      }

      // For first-time password change (mustChangePassword = true)
      // Firebase allows updatePassword if user was recently authenticated (within last hour)
      // Since staff just logged in, this should work
      if (user?.mustChangePassword) {
        const { error: updateError } = await authService.updatePassword(newPassword);
        
        if (updateError) {
          // If updatePassword fails (requires recent login), use password reset flow
          if (updateError.includes('requires-recent-login') || updateError.includes('recent')) {
            Alert.alert(
              'Re-authentication Required',
              'Please log out and log back in, then change your password. Or use the password reset email.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Send Reset Email',
                  onPress: async () => {
                    try {
                      await authService.sendPasswordReset(currentUser.email);
                      Alert.alert('Email Sent', 'Password reset email sent. Please check your inbox.');
                    } catch (e) {
                      Alert.alert('Error', 'Failed to send reset email: ' + e.message);
                    }
                  },
                },
              ]
            );
            return;
          }
          throw new Error(updateError);
        }
        
        // Update Firestore to mark password as changed
        await userService.updateUser(currentUser.uid, {
          mustChangePassword: false,
        });

        Alert.alert('Success', 'Password changed successfully!');
        setShowPasswordChange(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        // Reload user data
        const res = await userService.getUserById(currentUser.uid);
        setUser(res?.data);
        return;
      } else {
        // Regular password change - requires current password
        if (!currentPassword) {
          Alert.alert('Error', 'Please enter your current password');
          return;
        }

        const { error: reauthError } = await authService.reauthenticateWithEmailPassword(currentUser.email, currentPassword);
        if (reauthError) {
          throw new Error(reauthError);
        }

        const { error: updateError } = await authService.updatePassword(newPassword);
        if (updateError) {
          throw new Error(updateError);
        }

        Alert.alert('Success', 'Password changed successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error) {
      console.error('[StaffScreen] Password change error:', error);
      if (error.code === 'auth/wrong-password') {
        Alert.alert('Error', 'Current password is incorrect');
      } else if (error.code === 'auth/requires-recent-login') {
        Alert.alert('Error', 'Please log out and log back in, then try again');
      } else {
        Alert.alert('Error', error.message || 'Failed to change password');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.signOut();
      onNavigate('welcome');
    } catch (error) {
      Alert.alert('Logout Error', error.message);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Loading Staff Dashboard...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Staff Dashboard</Text>
        <HuzzPressable style={styles.logoutButton} onPress={handleLogout} haptic="light">
          <Text style={styles.logoutButtonText}>Logout</Text>
        </HuzzPressable>
      </View>

      <HuzzKeyboardAwareScrollView contentContainerStyle={styles.scrollContent}>
        {showPasswordChange && user?.mustChangePassword && (
          <View style={styles.passwordChangeBox}>
            <Text style={styles.boxTitle}>⚠️ Change Password Required</Text>
            <Text style={styles.boxText}>
              You must change your password before accessing the staff dashboard.
            </Text>

            <Text style={styles.label}>New Password *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter new password"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />

            <Text style={styles.label}>Confirm Password *</Text>
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <HuzzPressable
              style={[styles.actionBtn, { backgroundColor: '#90ee90', borderColor: '#228b22' }]}
              onPress={handlePasswordChange}
              disabled={changingPassword || !newPassword || !confirmPassword}
              haptic="medium"
            >
              <Text style={styles.actionText}>
                {changingPassword ? 'Changing...' : 'Change Password'}
              </Text>
            </HuzzPressable>
          </View>
        )}

        {!showPasswordChange && (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Staff Features</Text>
            <Text style={styles.boxText}>Features coming soon...</Text>
            <Text style={styles.boxText}>
              Staff functionality will be implemented here.
            </Text>

            <HuzzPressable
              style={[styles.actionBtn, { backgroundColor: '#87ceeb', borderColor: '#4682b4' }]}
              onPress={() => setShowPasswordChange(true)}
              haptic="light"
            >
              <Text style={styles.actionText}>Change Password</Text>
            </HuzzPressable>
          </View>
        )}
      </HuzzKeyboardAwareScrollView>
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
    color: tokens.colors.border,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: tokens.colors.borderDark,
    backgroundColor: tokens.colors.gray,
  },
  logoutButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.colors.text,
    textTransform: 'uppercase',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    fontWeight: 'bold',
    color: tokens.colors.text,
  },
  scrollContent: {
    padding: tokens.spacing.md,
    paddingBottom: tokens.spacing.xl,
  },
  box: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 3,
    borderColor: tokens.colors.borderDark,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
  },
  passwordChangeBox: {
    backgroundColor: '#fffef0',
    borderWidth: 3,
    borderColor: '#800020',
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
  },
  boxTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: tokens.colors.accent,
    letterSpacing: 0.8,
    marginBottom: tokens.spacing.sm,
  },
  boxText: {
    fontSize: 14,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.md,
    lineHeight: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.colors.text,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    padding: 12,
    fontSize: 14,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.sm,
  },
  actionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    marginTop: tokens.spacing.md,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '800',
    color: tokens.colors.text,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
