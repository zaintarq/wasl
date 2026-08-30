import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';
import { successStoryService } from '../../../services/firebaseService';
import { tokens } from '../../tokens';
import { HuzzPressable } from '../HuzzPressable.native';
import { LiveText } from '../live/LiveTypography.native';

const CARD_GRADIENTS = [
  ['#FBCFE8', '#F9A8D4'],
  ['#DDD6FE', '#C4B5FD'],
  ['#A7F3D0', '#6EE7B7'],
  ['#FDE68A', '#FCD34D'],
];

function snippet(text, max = 110) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function LoveStoriesTeaser({ onNavigate }) {
  const [stories, setStories] = useState([]);

  useEffect(() => {
    const unsub = successStoryService.listenPublishedStories(
      ({ data }) => setStories((data || []).slice(0, 4)),
      { limitCount: 4 }
    );
    return () => unsub?.();
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <Sparkles size={18} color={tokens.colors.brandPink} strokeWidth={2.2} />
          <LiveText style={styles.title}>Love stories</LiveText>
        </View>
        <HuzzPressable onPress={() => onNavigate('successStories')} haptic="light">
          <LiveText style={styles.readAll}>Read all</LiveText>
        </HuzzPressable>
      </View>
      <LiveText style={styles.sub}>Real couples who met on Wasl — shared anonymously.</LiveText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {(stories.length ? stories : [{ id: 'placeholder', body: 'Be the first to share your story when you are ready.', metViaLabel: 'We met on Wasl' }]).map(
          (item, index) => {
            const colors = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
            return (
              <HuzzPressable
                key={item.id}
                style={styles.cardOuter}
                onPress={() => onNavigate('successStories')}
                haptic="light"
              >
                <LinearGradient colors={colors} style={styles.card}>
                  <LiveText style={styles.cardTag}>{item.metViaLabel || 'We met on Wasl'}</LiveText>
                  {item.city ? <LiveText style={styles.cardCity}>{item.city}</LiveText> : null}
                  <LiveText style={styles.cardBody} numberOfLines={4}>
                    “{snippet(item.body)}”
                  </LiveText>
                </LinearGradient>
              </HuzzPressable>
            );
          }
        )}
      </ScrollView>
      <HuzzPressable style={styles.sharePill} onPress={() => onNavigate('successStories', { share: true })} haptic="medium">
        <LiveText style={styles.shareText}>Share your story ✨</LiveText>
      </HuzzPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.border,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '800', color: tokens.colors.text },
  readAll: { fontSize: 13, fontWeight: '700', color: tokens.colors.blue },
  sub: {
    fontSize: 13,
    color: tokens.colors.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 12,
    lineHeight: 18,
  },
  scroll: { paddingHorizontal: 16, gap: 12 },
  cardOuter: { width: 260 },
  card: {
    borderRadius: 18,
    padding: 16,
    minHeight: 148,
    borderWidth: 2,
    borderColor: 'rgba(43,36,32,0.12)',
  },
  cardTag: { fontSize: 10, fontWeight: '800', color: '#831843', textTransform: 'uppercase' },
  cardCity: { fontSize: 12, color: 'rgba(131,24,67,0.75)', marginTop: 2 },
  cardBody: { fontSize: 15, lineHeight: 22, color: '#4A044E', marginTop: 10, fontStyle: 'italic' },
  sharePill: {
    alignSelf: 'center',
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: tokens.colors.brandPink,
  },
  shareText: { fontSize: 13, fontWeight: '800', color: '#fff' },
});
