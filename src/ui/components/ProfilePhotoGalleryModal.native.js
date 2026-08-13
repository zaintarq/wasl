import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../tokens';
import { PhotoProgressBars } from './discovery/design2/PhotoProgressBars.native';

/**
 * Full-screen horizontal gallery for profile photos (swipe between images, pinch-friendly area).
 */
export function ProfilePhotoGalleryModal({ visible, uris, initialIndex = 0, onClose }) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const list = useMemo(
    () => (uris || []).filter((u) => typeof u === 'string' && String(u).trim().length > 0),
    [uris]
  );
  const scrollRef = useRef(null);
  const [page, setPage] = useState(0);

  const headerH = 52;
  const imgH = Math.max(200, winH - insets.top - insets.bottom - headerH - 40);

  useEffect(() => {
    if (!visible || !list.length) return;
    const i = Math.min(Math.max(0, initialIndex), list.length - 1);
    setPage(i);
    const t = requestAnimationFrame(() => {
      try {
        scrollRef.current?.scrollTo({ x: i * winW, y: 0, animated: false });
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(t);
  }, [visible, initialIndex, list.length, winW]);

  const onScrollEnd = useCallback(
    (e) => {
      const x = e.nativeEvent.contentOffset.x;
      const i = Math.round(x / Math.max(winW, 1));
      setPage(Math.min(Math.max(0, i), list.length - 1));
    },
    [winW, list.length]
  );

  const goToPage = useCallback(
    (index) => {
      if (list.length <= 1) return;
      const i = Math.min(Math.max(0, index), list.length - 1);
      setPage(i);
      try {
        scrollRef.current?.scrollTo({ x: i * winW, y: 0, animated: true });
      } catch {
        /* ignore */
      }
    },
    [list.length, winW]
  );

  const goNext = useCallback(() => {
    if (page < list.length - 1) goToPage(page + 1);
  }, [goToPage, list.length, page]);

  const goPrev = useCallback(() => {
    if (page > 0) goToPage(page - 1);
  }, [goToPage, page]);

  if (!list.length) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : undefined}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { height: headerH }]}>
          <View style={styles.headerProgress}>
            <PhotoProgressBars total={list.length} activeIndex={page} />
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        <View style={styles.galleryWrap}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            decelerationRate="fast"
            onMomentumScrollEnd={onScrollEnd}
            style={styles.galleryScroll}
          >
            {list.map((uri, idx) => (
              <View key={`${uri}-${idx}`} style={{ width: winW, height: imgH }}>
                <Image
                  source={{ uri: String(uri).trim() }}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                  transition={200}
                />
              </View>
            ))}
          </ScrollView>

          {list.length > 1 ? (
            <>
              <Pressable style={styles.tapLeft} onPress={goPrev} accessibilityLabel="Previous photo" />
              <Pressable style={styles.tapRight} onPress={goNext} accessibilityLabel="Next photo" />
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  galleryWrap: {
    flex: 1,
    minHeight: 200,
    position: 'relative',
  },
  galleryScroll: {
    flex: 1,
  },
  tapLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '38%',
    zIndex: 2,
  },
  tapRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '62%',
    zIndex: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    gap: 8,
  },
  headerProgress: {
    flex: 1,
    paddingTop: 4,
  },
  closeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  closeText: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.colors.accent,
  },
});
