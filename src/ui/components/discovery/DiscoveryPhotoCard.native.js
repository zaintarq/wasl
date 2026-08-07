import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../tokens';
import { FadeInImage } from '../FadeInImage.native';
import { HuzzPressable } from '../HuzzPressable.native';
import { getPresenceDisplay } from '../../../utils/presence';

/** Full-bleed photo layer — only this moves when swiping. */
export function DiscoveryPhotoCard({ user, onPhotoPress }) {
  const photoUri = String(user?.images?.[0] || '');
  const canOpenGallery =
    Array.isArray(user?.images) &&
    user.images.some((x) => typeof x === 'string' && String(x).trim().length > 0);

  return (
    <View style={styles.root}>
      <HuzzPressable
        style={StyleSheet.absoluteFill}
        onPress={() => onPhotoPress?.(user)}
        haptic="light"
        disabled={!canOpenGallery}
      >
        <FadeInImage source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" contentPosition="top" />
      </HuzzPressable>

      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.15)', 'transparent', 'rgba(15,23,42,0.55)', 'rgba(15,23,42,0.88)']}
        locations={[0, 0.35, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.pills} pointerEvents="box-none">
        {user?._isPendingRequest ? (
          <View style={[styles.pill, styles.pillAccent]}>
            <Text style={styles.pillText}>Wants to connect</Text>
          </View>
        ) : null}
        {!user?._isPendingRequest &&
          (() => {
            const p = getPresenceDisplay(user?.lastSeen);
            if (!p) return null;
            return (
              <View style={styles.pill}>
                <Text style={[styles.pillText, p.kind === 'online' && styles.pillOnline]}>
                  {p.kind === 'online' ? '● ' : ''}
                  {p.label}
                </Text>
              </View>
            );
          })()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#0f172a',
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
  },
  pills: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    gap: 8,
    alignItems: 'flex-start',
  },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: tokens.radius.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  pillAccent: {
    backgroundColor: 'rgba(225, 29, 72, 0.88)',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  pillOnline: {
    color: '#D1FAE5',
  },
});
