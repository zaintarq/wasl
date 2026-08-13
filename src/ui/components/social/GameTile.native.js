import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HuzzPressable } from '../HuzzPressable.native';

const INK = '#2B2420';
const CREAM = '#F7F1E8';
const ROTATIONS = [-4, 3, -2, 5, -3, 2];

export function GameTile({ game, index = 0, onPress, compact }) {
  const rotation = ROTATIONS[index % ROTATIONS.length];

  return (
    <HuzzPressable
      style={[styles.wrap, compact && styles.wrapCompact]}
      onPress={() => onPress?.(game)}
      haptic="light"
      accessibilityLabel={`Play ${game.title}`}
    >
      <View style={[styles.tile, { transform: [{ rotate: `${rotation}deg` }] }]}>
        <Text style={styles.emoji}>{game.emoji}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {game.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {game.subtitle}
        </Text>
      </View>
    </HuzzPressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '48%',
    marginBottom: 12,
  },
  wrapCompact: {
    width: 108,
    marginRight: 10,
    marginBottom: 0,
  },
  tile: {
    backgroundColor: CREAM,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    minHeight: 108,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: INK,
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(43, 36, 32, 0.62)',
  },
});
