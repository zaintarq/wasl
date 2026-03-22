import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { tokens } from '../tokens';

export function FadeInImage({
  source,
  style,
  resizeMode = 'cover',
  placeholderColor = tokens.colors.bg,
  contentPosition = 'center',
}) {
  const containerStyle = useMemo(
    () => [styles.container, { backgroundColor: placeholderColor }, style],
    [placeholderColor, style]
  );

  return (
    <View style={containerStyle}>
      <Image
        source={source}
        contentFit={resizeMode === 'contain' ? 'contain' : 'cover'}
        contentPosition={contentPosition}
        transition={180}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});




