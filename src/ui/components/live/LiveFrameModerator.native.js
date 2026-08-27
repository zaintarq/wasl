import React, { useEffect, useRef } from 'react';
import { moderateLiveFrame } from '../../../services/liveFrameModerationService';

const FIRST_SAMPLE_MS = 5000;
const INTERVAL_MS = 7000;

/**
 * Periodically snapshots the local PIP (view-shot) and runs Vision Safe Search.
 * Renders nothing. Fail-open on capture/network errors.
 */
export function LiveFrameModerator({ sessionId, cameraOff, captureTargetRef, onViolation }) {
  const busyRef = useRef(false);
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;

  useEffect(() => {
    if (!sessionId || cameraOff) return undefined;

    let cancelled = false;

    const sample = async () => {
      if (cancelled || busyRef.current || cameraOff) return;
      const target = captureTargetRef?.current;
      if (!target) return;

      busyRef.current = true;
      try {
        const { captureRef } = require('react-native-view-shot');
        let base64 = await captureRef(target, {
          format: 'jpg',
          quality: 0.45,
          result: 'base64',
          width: 360,
          height: 480,
        });
        if (!base64 || cancelled) return;

        // Optional downscale via ImageManipulator when capture is a temp file path — base64 path is fine.
        if (base64.startsWith('/')) {
          try {
            const ImageManipulator = require('expo-image-manipulator');
            const FileSystem = require('expo-file-system');
            const manipulated = await ImageManipulator.manipulateAsync(
              base64,
              [{ resize: { width: 360 } }],
              { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
            );
            base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          } catch {
            // keep original
          }
        }

        const result = await moderateLiveFrame(sessionId, base64);
        if (cancelled) return;
        if (result?.blocked) {
          onViolationRef.current?.(result);
        }
      } catch (e) {
        console.warn('[LiveFrameModerator]', e?.message || e);
      } finally {
        busyRef.current = false;
      }
    };

    const first = setTimeout(sample, FIRST_SAMPLE_MS);
    const iv = setInterval(sample, INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [sessionId, cameraOff, captureTargetRef]);

  return null;
}
