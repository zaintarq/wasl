import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Maximize2 } from 'lucide-react-native';
import { FadeInImage } from '../../FadeInImage.native';
import { HuzzPressable } from '../../HuzzPressable.native';
import { PhotoProgressBars } from './PhotoProgressBars.native';
import { getProfileImageUrls } from '../../../../utils/profileImages';
import { isUserOnline } from '../../../../utils/presence';

const ONLINE_DOT = '#3FAE7F';

const DiscoveryProfileCardInner = ({ user, panGesture, isTop, onPhotoPress }) => {
  const { width: winW } = useWindowDimensions();
  const images = useMemo(() => getProfileImageUrls(user), [user]);
  const [photoIndex, setPhotoIndex] = useState(0);

  const activeUri = images[photoIndex] || images[0] || '';
  const total = images.length || 1;

  useEffect(() => {
    setPhotoIndex(0);
  }, [user?.id, user?.uid]);

  const showOnlineDot = useMemo(() => isUserOnline(user?.lastSeen), [user?.lastSeen]);

  const locationLine = useMemo(() => {
    const parts = [user?.location, user?.countryOfResidence, user?.distance ? `${user.distance} km` : null].filter(Boolean);
    return parts.join(', ') || 'Nearby';
  }, [user]);

  const bioText = useMemo(() => String(user?.bio || '').trim(), [user?.bio]);

  const openExpanded = useCallback(() => {
    onPhotoPress?.(user, photoIndex);
  }, [onPhotoPress, photoIndex, user]);

  const goNext = useCallback(() => {
    if (images.length <= 1) return;
    setPhotoIndex((i) => Math.min(i + 1, images.length - 1));
  }, [images.length]);

  const goPrev = useCallback(() => {
    if (images.length <= 1) return;
    setPhotoIndex((i) => Math.max(i - 1, 0));
  }, [images.length]);

  const handlePhotoTap = useCallback(
    (x) => {
      if (images.length <= 1) return;
      const cardW = Math.min(winW - 32, 440);
      if (x < cardW / 2) goPrev();
      else goNext();
    },
    [goNext, goPrev, images.length, winW]
  );

  const photoTap = useMemo(() => {
    return Gesture.Tap()
      .maxDuration(260)
      .maxDistance(14)
      .onEnd((e) => {
        runOnJS(handlePhotoTap)(e.x);
      });
  }, [handlePhotoTap]);

  const cardGesture = useMemo(() => {
    if (!panGesture || !isTop) return photoTap;
    return Gesture.Simultaneous(panGesture, photoTap);
  }, [isTop, panGesture, photoTap]);

  const photoArea = (
    <View style={styles.photoWrap}>
      <FadeInImage source={{ uri: activeUri }} style={styles.photo} resizeMode="cover" contentPosition="top" />

      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)', 'rgba(20,10,15,0.15)', 'rgba(20,10,15,0.75)']}
        locations={[0, 0.12, 0.35, 1]}
        style={styles.scrim}
        pointerEvents="none"
      />

      <View style={styles.topChrome} pointerEvents="box-none">
        {total > 1 ? <PhotoProgressBars total={total} activeIndex={photoIndex} /> : null}
        <HuzzPressable
          style={styles.expandBtn}
          onPress={openExpanded}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="View full photo"
        >
          <Maximize2 size={16} color="#FFFFFF" strokeWidth={2.3} />
        </HuzzPressable>
      </View>

      <View style={styles.infoOverlay} pointerEvents="none">
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user?.name || 'User'}
            {user?.age ? (
              <Text style={styles.age}>, {user.age}</Text>
            ) : null}
          </Text>
          {showOnlineDot ? <View style={styles.onlineDot} /> : null}
        </View>

        <View style={styles.locationRow}>
          <MapPin size={16} color="rgba(255,255,255,0.9)" strokeWidth={2.2} />
          <Text style={styles.location} numberOfLines={1}>
            {locationLine}
          </Text>
        </View>

        {bioText ? (
          <Text style={styles.bio} numberOfLines={2} ellipsizeMode="tail">
            {bioText}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <GestureDetector gesture={cardGesture}>{photoArea}</GestureDetector>
      </View>
    </View>
  );
};

export const DiscoveryProfileCard = React.memo(DiscoveryProfileCardInner);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
  card: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    shadowColor: '#831843',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  photoWrap: {
    flex: 1,
    minHeight: 180,
    backgroundColor: '#0f172a',
  },
  photo: { ...StyleSheet.absoluteFillObject },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  topChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
  },
  expandBtn: {
    position: 'absolute',
    top: 22,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  infoOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 28,
  },
  name: {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  age: {
    fontWeight: '400',
    color: 'rgba(255,255,255,0.92)',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ONLINE_DOT,
    flexShrink: 0,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  location: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
  },
  bio: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.95)',
  },
});
