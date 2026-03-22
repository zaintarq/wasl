import React, { useRef, useEffect } from 'react';
import { TouchableOpacity, Pressable } from 'react-native';
import { activityService } from '../../services/activityService';
import { authService } from '../../services/firebaseService';
import { vpnDetectionService } from '../../services/vpnDetectionService';

let sessionId = null;
let ipAddressCache = null;
let ipAddressPromise = null;

// Initialize session ID
if (!sessionId) {
  sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Cache IP address (fetch once per session)
async function getCachedIpAddress() {
  if (ipAddressCache) return ipAddressCache;
  if (ipAddressPromise) return ipAddressPromise;

  ipAddressPromise = vpnDetectionService.getCurrentIpAddress().then((data) => {
    ipAddressCache = data.ipAddress;
    return data.ipAddress;
  });

  return ipAddressPromise;
}

/**
 * ActivityTracker - Wrapper component to track button presses and user interactions
 * Usage: Wrap any pressable component with <ActivityTracker actionType="button_name">
 */
export function ActivityTracker({ children, actionType, actionData = {}, screenName = null, onPress, ...props }) {
  const trackingRef = useRef(false);

  const handlePress = async (event) => {
    // Call original onPress if provided
    if (onPress) {
      onPress(event);
    }

    // Track activity (non-blocking)
    if (!trackingRef.current) {
      trackingRef.current = true;
      setTimeout(() => {
        trackingRef.current = false;
      }, 1000); // Debounce: max 1 track per second per button

      try {
        const userId = authService.getCurrentUser()?.uid;
        if (!userId) return;

        const ipAddress = await getCachedIpAddress();

        activityService
          .trackActivity(userId, actionType, actionData, ipAddress, screenName, sessionId)
          .catch((err) => {
            console.warn('[ActivityTracker] Track error:', err);
          });

        // Also track IP for VPN detection (silently, on significant actions)
        if (['swipe_left', 'swipe_right', 'like', 'pass', 'message_sent', 'login', 'signup'].includes(actionType)) {
          vpnDetectionService
            .trackIpAndDetectVpn(userId, actionType)
            .catch((err) => {
              console.warn('[ActivityTracker] VPN detection error:', err);
            });
        }
      } catch (error) {
        console.warn('[ActivityTracker] Error:', error);
      }
    }
  };

  // If children is a function or has onPress, wrap it
  if (React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...props,
      onPress: handlePress,
      onPressIn: handlePress, // Also track press-in for better coverage
    });
  }

  // Default: wrap in TouchableOpacity
  return (
    <TouchableOpacity {...props} onPress={handlePress} activeOpacity={0.7}>
      {children}
    </TouchableOpacity>
  );
}

/**
 * HOC to add activity tracking to any component
 */
export function withActivityTracking(Component, defaultActionType) {
  return function TrackedComponent(props) {
    const { actionType = defaultActionType, actionData = {}, screenName = null, ...restProps } = props;

    return (
      <ActivityTracker actionType={actionType} actionData={actionData} screenName={screenName}>
        <Component {...restProps} />
      </ActivityTracker>
    );
  };
}
