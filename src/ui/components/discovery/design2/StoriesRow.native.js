import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus } from 'lucide-react-native';
import { tokens } from '../../../tokens';
import { HuzzPressable } from '../../HuzzPressable.native';
import { FadeInImage } from '../../FadeInImage.native';

const STORY_RING = [tokens.colors.brandPink, tokens.colors.brandPinkDark];
const STORY_RING_SEEN = ['rgba(155, 154, 151, 0.55)', 'rgba(155, 154, 151, 0.35)'];

export function StoriesRow({ stories = [], onAddStory, onStoryPress, onViewMyStory, myPreviewUrl, myHasStory }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
    >
      <View style={styles.item}>
        <View style={styles.addOuter}>
          {myHasStory && myPreviewUrl ? (
            <HuzzPressable onPress={onViewMyStory} haptic="light" accessibilityLabel="View your story">
              <LinearGradient colors={STORY_RING} style={styles.ring}>
                <View style={styles.avatarInner}>
                  <FadeInImage source={{ uri: myPreviewUrl }} style={styles.avatarImg} resizeMode="cover" />
                </View>
              </LinearGradient>
            </HuzzPressable>
          ) : (
            <HuzzPressable onPress={onAddStory} haptic="light" accessibilityLabel="Add story">
              <View style={styles.addBtn}>
                <Plus size={22} color="#FFFFFF" strokeWidth={2.5} />
              </View>
            </HuzzPressable>
          )}
          {myHasStory ? (
            <HuzzPressable style={styles.addBadge} onPress={onAddStory} haptic="light" accessibilityLabel="Add story">
              <Plus size={14} color="#FFFFFF" strokeWidth={2.8} />
            </HuzzPressable>
          ) : null}
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {myHasStory ? 'Your story' : 'Add Story'}
        </Text>
      </View>

      {stories.map((story) => (
        <HuzzPressable
          key={story.id}
          style={styles.item}
          onPress={() => onStoryPress?.(story)}
          haptic="light"
          accessibilityLabel={`${story.name} story`}
        >
          <LinearGradient
            colors={story.hasUnseen !== false ? STORY_RING : STORY_RING_SEEN}
            style={styles.ring}
          >
            <View style={styles.avatarInner}>
              {story.uri ? (
                <FadeInImage source={{ uri: story.uri }} style={styles.avatarImg} resizeMode="cover" />
              ) : (
                <View style={[styles.avatarImg, styles.avatarFallback]}>
                  <Text style={styles.initial}>{story.initial || '?'}</Text>
                </View>
              )}
            </View>
          </LinearGradient>
          <Text style={styles.name} numberOfLines={1}>
            {story.name}
          </Text>
        </HuzzPressable>
      ))}
    </ScrollView>
  );
}

const SIZE = 60;

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: {
    paddingHorizontal: tokens.spacing.screenHorizontal,
    gap: 14,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  item: { width: SIZE + 4, alignItems: 'center' },
  addOuter: {
    width: SIZE + 4,
    height: SIZE + 4,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  addBtn: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: tokens.colors.brandPink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: tokens.colors.brandPink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: tokens.colors.bg,
  },
  ring: {
    width: SIZE + 4,
    height: SIZE + 4,
    borderRadius: (SIZE + 4) / 2,
    padding: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: 'hidden',
    backgroundColor: tokens.colors.surface,
    borderWidth: 2,
    borderColor: tokens.colors.bg,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarFallback: {
    backgroundColor: tokens.colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 20, fontWeight: '700', color: tokens.colors.brandPinkDeep },
  name: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: tokens.colors.textOnBrand,
    textAlign: 'center',
    maxWidth: SIZE + 8,
  },
});
