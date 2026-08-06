import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions } from 'react-native';
import { tokens } from '../../ui/tokens';
import { FadeInImage } from '../../ui/components/FadeInImage.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { getProfileImageUrls } from '../../utils/profileImages';

const COLS = 3;
const GAP = 8;

export function DiscoveryProfileGrid({ profiles, onSelectProfile, contentPaddingBottom = 24 }) {
  const tileSize = useMemo(() => {
    const screenW = Dimensions.get('window').width;
    const hPad = tokens.spacing.screenHorizontal;
    return Math.floor((screenW - hPad * 2 - GAP * (COLS - 1)) / COLS);
  }, []);

  const tileHeight = Math.round(tileSize * 1.28);

  return (
    <FlatList
      data={profiles}
      numColumns={COLS}
      keyExtractor={(item, index) => String(item?.id ?? item?.uid ?? index)}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: contentPaddingBottom },
      ]}
      columnWrapperStyle={styles.row}
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => {
        const uri = getProfileImageUrls(item)[0] || '';
        const name = String(item?.name || 'User').trim();
        const age = item?.age ? `, ${item.age}` : '';

        return (
          <HuzzPressable
            style={[styles.tile, { width: tileSize, height: tileHeight }]}
            onPress={() => onSelectProfile(index)}
            haptic="light"
          >
            {uri ? (
              <FadeInImage source={{ uri }} style={styles.photo} resizeMode="cover" contentPosition="top" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.placeholderInitial}>{name.charAt(0).toUpperCase() || '?'}</Text>
              </View>
            )}
            <View style={styles.nameScrim} />
            <Text style={styles.name} numberOfLines={1}>
              {name}
              {age}
            </Text>
            {item?._isPendingRequest ? <View style={styles.newDot} /> : null}
          </HuzzPressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingTop: 4,
  },
  row: {
    gap: GAP,
    marginBottom: GAP,
  },
  tile: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
  },
  photoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.filterBgSky,
  },
  placeholderInitial: {
    fontSize: 28,
    fontWeight: '700',
    color: tokens.colors.blue,
  },
  nameScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  name: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  newDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: tokens.colors.accent,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
