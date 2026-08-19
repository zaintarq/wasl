import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { tokens } from '../ui/tokens';

/** Whether the user prefers reduced motion (system accessibility setting). */
export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => {
        if (mounted) setReduceMotion(!!enabled);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (enabled) => {
      setReduceMotion(!!enabled);
    });

    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduceMotion;
}

/** Pick a Reanimated spring config respecting reduce-motion. */
export function pickSpring(defaultSpring, reduceMotion) {
  if (reduceMotion) {
    return { damping: 500, stiffness: 500, mass: 1 };
  }
  return defaultSpring || tokens.motion.spring.jelly;
}
