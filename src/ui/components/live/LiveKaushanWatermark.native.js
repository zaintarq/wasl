import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useFonts, KaushanScript_400Regular } from '@expo-google-fonts/kaushan-script';
import { tokens } from '../../tokens';

const WORDS = ['Huzz', 'Live', 'Huzz'];

/**
 * Subtle repeating Kaushan text across the screen (brand texture, not readable copy).
 */
export function LiveKaushanWatermark() {
  const { width, height } = useWindowDimensions();
  const [fontsLoaded] = useFonts({ KaushanScript_400Regular });

  if (!fontsLoaded) return null;

  const rowHeight = 64;
  const cols = 3;
  const rows = Math.min(18, Math.ceil(height / rowHeight) + 4);
  const cellW = width / cols;

  return (
    <View style={[styles.layer, { height }]} pointerEvents="none">
      {Array.from({ length: rows }).map((_, r) => (
        <View key={`r-${r}`} style={[styles.row, { marginTop: r === 0 ? 40 : -6 }]}>
          {Array.from({ length: cols }).map((_, c) => (
            <Text
              key={`${r}-${c}`}
              style={[
                styles.mark,
                {
                  width: cellW,
                  fontFamily: 'KaushanScript_400Regular',
                  transform: [{ rotate: '-14deg' }],
                },
              ]}
            >
              {WORDS[(r + c) % WORDS.length]}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  mark: {
    fontSize: 40,
    color: tokens.colors.text,
    opacity: 0.045,
    textAlign: 'center',
    paddingVertical: 4,
  },
});
