import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gamepad2 } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { HuzzPressable } from '../HuzzPressable.native';
import { FadeInImage } from '../FadeInImage.native';

const INK = '#2B2420';

export function SocialFriendChip({ user, selected, onPress, onPlayPress }) {
  const name = user?.name || user?.displayName || 'Friend';
  const avatar = Array.isArray(user?.images) ? user.images[0] : user?.photoURL || '';

  return (
    <View style={styles.wrap}>
      <HuzzPressable
        style={[styles.chip, selected && styles.chipSelected]}
        onPress={() => onPress?.(user)}
        haptic="light"
        accessibilityLabel={name}
      >
        {avatar ? (
          <FadeInImage source={{ uri: avatar }} style={styles.avatar} resizeMode="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.initial}>{String(name).charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.name} numberOfLines={1}>
          {name.split(' ')[0]}
        </Text>
      </HuzzPressable>
      <HuzzPressable
        style={styles.playBtn}
        onPress={() => onPlayPress?.(user)}
        haptic="medium"
        accessibilityLabel={`Play with ${name}`}
      >
        <Gamepad2 size={14} color="#F7F1E8" strokeWidth={2.2} />
      </HuzzPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 72,
    alignItems: 'center',
    marginRight: 12,
  },
  chip: {
    alignItems: 'center',
    width: 72,
  },
  chipSelected: {
    opacity: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: tokens.colors.surface,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.shellIconBtn,
  },
  initial: {
    fontSize: 20,
    fontWeight: '800',
    color: tokens.colors.textOnBrand,
  },
  name: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    color: tokens.colors.textOnBrand,
    maxWidth: 72,
    textAlign: 'center',
  },
  playBtn: {
    position: 'absolute',
    right: 0,
    top: 38,
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: tokens.colors.bg,
  },
});
