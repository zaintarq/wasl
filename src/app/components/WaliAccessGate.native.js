import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import { authService, waliService, userService } from '../../services/firebaseService';

/**
 * WaliAccessGate - Component that manages wali access consent
 * Shows consent request modal if consentLevel === 'ask'
 * Logs all wali actions to audit trail
 */
export function WaliAccessGate({ userId, matchId, action, onConsentGiven, onConsentDenied, children }) {
  const [consentNeeded, setConsentNeeded] = useState(false);
  const [checking, setChecking] = useState(true);
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    const checkConsent = async () => {
      try {
        const res = await userService.getUserById(userId);
        const profile = res?.data;
        setUserProfile(profile);

        if (!profile?.wali?.name) {
          setChecking(false);
          return;
        }

        const consentLevel = profile.wali.consentLevel || 'ask';

        if (consentLevel === 'never') {
          // Access denied
          if (onConsentDenied) onConsentDenied('Wali access denied by user');
          setChecking(false);
          return;
        }

        if (consentLevel === 'always') {
          // Always allowed - log and proceed
          await waliService.logWaliAction(userId, matchId, action, {
            consentType: 'always',
            userConsentGiven: true,
          });
          if (onConsentGiven) onConsentGiven();
          setChecking(false);
          return;
        }

        if (consentLevel === 'ask') {
          // Need to ask user
          setConsentNeeded(true);
          setChecking(false);
          return;
        }

        setChecking(false);
      } catch (error) {
        console.error('[WaliAccessGate] Error checking consent:', error);
        setChecking(false);
      }
    };

    if (userId) {
      checkConsent();
    }
  }, [userId, matchId, action]);

  const handleApprove = async () => {
    try {
      await waliService.logWaliAction(userId, matchId, action, {
        consentType: 'ask',
        userConsentGiven: true,
      });
      setConsentNeeded(false);
      if (onConsentGiven) onConsentGiven();
    } catch (error) {
      console.error('[WaliAccessGate] Error approving:', error);
      Alert.alert('Error', 'Failed to approve wali access.');
    }
  };

  const handleDeny = async () => {
    try {
      await waliService.logWaliAction(userId, matchId, action, {
        consentType: 'ask',
        userConsentGiven: false,
      });
      setConsentNeeded(false);
      if (onConsentDenied) onConsentDenied('User denied wali access');
    } catch (error) {
      console.error('[WaliAccessGate] Error denying:', error);
    }
  };

  if (checking) {
    return null; // Or show loading indicator
  }

  if (consentNeeded) {
    return (
      <>
        <Modal visible={consentNeeded} transparent animationType="fade" onRequestClose={handleDeny}>
          <View style={styles.backdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.title}>Wali Access Request</Text>
              <Text style={styles.message}>
                Your wali ({userProfile?.wali?.name || 'Guardian'}) wants to {action} in this match.
              </Text>
              <Text style={styles.subMessage}>Do you want to allow this?</Text>

              <View style={styles.buttonContainer}>
                <TouchableOpacity style={[styles.button, styles.approveButton]} onPress={handleApprove}>
                  <Text style={styles.approveButtonText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.denyButton]} onPress={handleDeny}>
                  <Text style={styles.denyButtonText}>Deny</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        {children}
      </>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#8b4513',
    padding: 24,
    maxWidth: 400,
    width: '100%',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#8b4513',
    marginBottom: 12,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  message: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    lineHeight: 20,
    marginBottom: 8,
    textAlign: 'center',
  },
  subMessage: {
    fontSize: 12,
    fontWeight: '800',
    color: '#800020',
    marginBottom: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButton: {
    backgroundColor: '#90ee90',
    borderColor: '#228b22',
  },
  approveButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  denyButton: {
    backgroundColor: '#ff6b6b',
    borderColor: '#dc143c',
  },
  denyButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
});
