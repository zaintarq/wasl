import { useCallback, useEffect, useRef, useState } from 'react';
import { captureRef } from 'react-native-view-shot';
import {
  NSFW_CAPTURE_HEIGHT,
  NSFW_CAPTURE_WIDTH,
  NSFW_VIDEO_CONSECUTIVE_HITS,
  NSFW_VIDEO_SCAN_MS,
} from '../config/nsfwConfig';
import { classifyImageUri, isNsfwPredictions } from '../services/nsfwScanner.native';

/**
 * Periodically captures a video view and runs NSFWJS on-device.
 * Blurs after first hit; calls onNsfwConfirmed after consecutive hits.
 */
export function useNsfwVideoGuard({
  viewRef,
  enabled = false,
  intervalMs = NSFW_VIDEO_SCAN_MS,
  consecutiveHits = NSFW_VIDEO_CONSECUTIVE_HITS,
  onNsfwConfirmed,
}) {
  const [shielded, setShielded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const hitsRef = useRef(0);
  const busyRef = useRef(false);
  const firedRef = useRef(false);
  const onConfirmRef = useRef(onNsfwConfirmed);
  onConfirmRef.current = onNsfwConfirmed;

  const reset = useCallback(() => {
    hitsRef.current = 0;
    firedRef.current = false;
    setShielded(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      reset();
      return undefined;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled || busyRef.current || firedRef.current || !viewRef?.current) return;
      busyRef.current = true;
      setScanning(true);
      try {
        const uri = await captureRef(viewRef, {
          format: 'jpg',
          quality: 0.45,
          width: NSFW_CAPTURE_WIDTH,
          height: NSFW_CAPTURE_HEIGHT,
          result: 'tmpfile',
        });
        const { predictions, error } = await classifyImageUri(uri);
        if (cancelled || error || !predictions) {
          return;
        }
        if (isNsfwPredictions(predictions)) {
          hitsRef.current += 1;
          setShielded(true);
          if (hitsRef.current >= consecutiveHits && !firedRef.current) {
            firedRef.current = true;
            onConfirmRef.current?.({ predictions });
          }
        } else {
          hitsRef.current = 0;
          setShielded(false);
        }
      } catch {
        // Black frames / capture failures on some Android GPUs — ignore.
      } finally {
        busyRef.current = false;
        if (!cancelled) setScanning(false);
      }
    };

    const warmup = setTimeout(tick, 2000);
    const iv = setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      clearTimeout(warmup);
      clearInterval(iv);
      busyRef.current = false;
    };
  }, [enabled, intervalMs, consecutiveHits, viewRef, reset]);

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  return { shielded, scanning, reset };
}
