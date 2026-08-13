import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Maximize2 } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { FadeInImage } from '../FadeInImage.native';
import { HuzzPressable } from '../HuzzPressable.native';
import { ProfileVoicePlayer } from '../ProfileVoicePlayer.native';
import { GlassPanel } from '../GlassPanel.native';
import { LiveText } from '../live/LiveTypography.native';
import { getPresenceDisplay } from '../../../utils/presence';

const CARD_OVERLAP = 20;
const PHOTO_FLEX = 58;

function DetailRow({ label, value }) {
  const text = String(value || '').trim();
  if (!text) return null;
  return (
    <View style={styles.detailRow}>
      <LiveText style={styles.detailLabel}>{label}</LiveText>
      <LiveText style={styles.detailValue} numberOfLines={6}>
        {text}
      </LiveText>
    </View>
  );
}

/** Photo-forward card — name on photo scrim, details in frosted glass panel. */
export function DiscoveryProfileStack({ user, onPhotoPress, panGesture, isTop }) {
  const images = useMemo(
    () =>
      (Array.isArray(user?.images) ? user.images : []).filter(
        (x) => typeof x === 'string' && String(x).trim().length > 0
      ),
    [user?.images]
  );
  const userKey = user?.id ?? user?.uid ?? user?.name ?? '';
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    setPhotoIndex(0);
  }, [userKey]);

  const activeUri = images[photoIndex] || images[0] || '';
  const hasMultiple = images.length > 1;
  const canOpenGallery = images.length > 0;

  const openExpanded = useCallback(() => {
    if (!canOpenGallery) return;
    onPhotoPress?.(user, photoIndex);
  }, [canOpenGallery, onPhotoPress, photoIndex, user]);

  const goNextPhoto = useCallback(() => {
    if (!hasMultiple) {
      openExpanded();
      return;
    }
    setPhotoIndex((i) => (i + 1) % images.length);
  }, [hasMultiple, images.length, openExpanded]);

  const goPrevPhoto = useCallback(() => {
    if (!hasMultiple) return;
    setPhotoIndex((i) => (i - 1 + images.length) % images.length);
  }, [hasMultiple, images.length]);

  const interestsText = useMemo(() => {
    const list = Array.isArray(user?.interests) ? user.interests.filter(Boolean) : [];
    return list.slice(0, 8).join(', ');
  }, [user?.interests]);

  const presence = useMemo(() => getPresenceDisplay(user?.lastSeen), [user?.lastSeen]);

  const locationLine = [
    user?.location || user?.countryOfResidence || 'Nearby',
    user?.distance ? `${user.distance} km` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const photoBlock = (
    <View style={styles.photoSection}>
      <FadeInImage
        source={{ uri: activeUri }}
        style={styles.photo}
        resizeMode="cover"
        contentPosition="top"
      />

      <LinearGradient
        colors={tokens.colors.photoScrim}
        locations={[0, 0.45, 1]}
        style={styles.photoScrim}
        pointerEvents="none"
      />

      <View style={styles.heroText} pointerEvents="none">
        <LiveText style={styles.profileName} numberOfLines={1}>
          {user?.name || 'User'}
          {user?.age ? `, ${user.age}` : ''}
          {user?.isVerified ? ' ✓' : ''}
        </LiveText>
        <LiveText style={styles.profileLocation} numberOfLines={1}>
          {locationLine}
        </LiveText>
        {presence ? (
          <View style={styles.presenceRow}>
            {presence.kind === 'online' ? <View style={styles.presenceDot} /> : null}
            <LiveText
              style={[
                styles.presenceText,
                presence.kind === 'online' && styles.presenceTextOnline,
              ]}
            >
              {presence.kind === 'online' ? 'Online now' : presence.label}
            </LiveText>
          </View>
        ) : null}
      </View>

      {hasMultiple ? (
        <>
          <HuzzPressable
            style={styles.tapZoneLeft}
            onPress={goPrevPhoto}
            haptic="light"
            accessibilityLabel="Previous photo"
          />
          <HuzzPressable
            style={styles.tapZoneRight}
            onPress={goNextPhoto}
            haptic="light"
            accessibilityLabel="Next photo"
          />
        </>
      ) : (
        <HuzzPressable
          style={StyleSheet.absoluteFill}
          onPress={openExpanded}
          haptic="light"
          disabled={!canOpenGallery}
          accessibilityLabel="View full photo"
        />
      )}

      {canOpenGallery ? (
        <HuzzPressable
          style={styles.expandBtn}
          onPress={openExpanded}
          onLongPress={openExpanded}
          haptic="light"
          accessibilityLabel="Expand photo"
        >
          <Maximize2 size={18} color="#fff" strokeWidth={2.2} />
        </HuzzPressable>
      ) : null}

      {hasMultiple ? (
        <View style={styles.photoSegments} pointerEvents="none">
          {images.slice(0, 6).map((_, idx) => (
            <View
              key={idx}
              style={[styles.photoSegment, idx === photoIndex && styles.photoSegmentActive]}
            />
          ))}
        </View>
      ) : null}

      {user?._isPendingRequest ? (
        <View style={styles.pendingBadge} pointerEvents="none">
          <LiveText style={styles.pendingText}>Wants to connect</LiveText>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      {panGesture && isTop ? (
        <GestureDetector gesture={panGesture}>{photoBlock}</GestureDetector>
      ) : (
        photoBlock
      )}

      <View style={styles.detailsWrap}>
        <GlassPanel style={styles.glass} contentStyle={styles.glassInner}>
          <ScrollView
            style={styles.infoScroll}
            contentContainerStyle={styles.infoScrollContent}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <DetailRow label="Religion" value={user?.religion} />
            <DetailRow label="Add me" value={user?.addMe} />
            <DetailRow label="About" value={user?.bio} />
            <DetailRow label="Interests" value={interestsText} />

            {!!String(user?.aboutVoiceUrl || '').trim() && (
              <View style={styles.voiceBlock}>
                <LiveText style={styles.detailLabel}>Voice</LiveText>
                <ProfileVoicePlayer
                  audioUrl={String(user.aboutVoiceUrl).trim()}
                  durationMs={user?.aboutVoiceDurationMs}
                />
              </View>
            )}
          </ScrollView>
        </GlassPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 0,
    backgroundColor: tokens.colors.bg,
  },
  photoSection: {
    flex: PHOTO_FLEX,
    minHeight: 200,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderBottomLeftRadius: tokens.radius.lg,
    borderBottomRightRadius: tokens.radius.lg,
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
  },
  photoScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '52%',
    zIndex: 1,
  },
  heroText: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    paddingHorizontal: 18,
    paddingBottom: CARD_OVERLAP + 14,
    paddingTop: 24,
  },
  tapZoneLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '38%',
    zIndex: 4,
  },
  tapZoneRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '62%',
    zIndex: 4,
  },
  expandBtn: {
    position: 'absolute',
    top: 28,
    right: 14,
    zIndex: 5,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  photoSegments: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    flexDirection: 'row',
    gap: 4,
    zIndex: 2,
  },
  photoSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  photoSegmentActive: {
    backgroundColor: '#fff',
  },
  pendingBadge: {
    position: 'absolute',
    top: 22,
    left: 14,
    backgroundColor: 'rgba(225, 29, 72, 0.9)',
    borderRadius: tokens.radius.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
    zIndex: 3,
  },
  pendingText: {
    ...tokens.typography.caption,
    fontWeight: '700',
    color: '#fff',
  },
  profileName: {
    ...tokens.typography.titleLarge,
    color: '#FFFFFF',
    lineHeight: 32,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  profileLocation: {
    ...tokens.typography.bodySmall,
    marginTop: 4,
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  presenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.colors.green,
  },
  presenceText: {
    ...tokens.typography.caption,
    color: 'rgba(255,255,255,0.85)',
  },
  presenceTextOnline: {
    color: '#A7F3D0',
    fontWeight: '600',
  },
  detailsWrap: {
    flex: 100 - PHOTO_FLEX,
    minHeight: 0,
    marginTop: -CARD_OVERLAP,
    zIndex: 3,
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  glass: {
    flex: 1,
  },
  glassInner: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  infoScroll: {
    flex: 1,
    minHeight: 0,
  },
  infoScrollContent: {
    paddingBottom: 8,
    gap: 2,
  },
  detailRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  detailLabel: {
    ...tokens.typography.caption,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  detailValue: {
    ...tokens.typography.bodySmall,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  voiceBlock: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
});
