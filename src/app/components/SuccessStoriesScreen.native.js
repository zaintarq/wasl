import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  TextInput,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, Sparkles } from 'lucide-react-native';
import { successStoryService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
import { ScreenBackHeader } from '../../ui/components/ScreenBackHeader.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';

const MET_VIA_OPTIONS = [
  { id: 'match', label: 'We matched on Wasl', emoji: '💞' },
  { id: 'club', label: 'We met in a club', emoji: '🎙️' },
  { id: 'live', label: 'Wasl Live', emoji: '📹' },
  { id: 'other', label: 'Another way on Wasl', emoji: '✨' },
];

const CARD_GRADIENTS = [
  ['#FBCFE8', '#F9A8D4', '#F472B6'],
  ['#E9D5FF', '#C4B5FD', '#A78BFA'],
  ['#A7F3D0', '#6EE7B7', '#34D399'],
  ['#FEF08A', '#FDE047', '#FACC15'],
  ['#FECDD3', '#FDA4AF', '#FB7185'],
];

const { width: SCREEN_W } = Dimensions.get('window');

export function SuccessStoriesScreen({ onNavigate, openShare }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitOpen, setSubmitOpen] = useState(!!openShare);
  const [body, setBody] = useState('');
  const [city, setCity] = useState('');
  const [metVia, setMetVia] = useState('match');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = successStoryService.listenPublishedStories(({ data, error }) => {
      setStories(data || []);
      setLoading(false);
      if (error) console.warn('[successStories]', error);
    });
    return () => unsub?.();
  }, []);

  const submit = useCallback(async () => {
    const trimmed = body.trim();
    if (trimmed.length < 40) {
      Alert.alert('A bit longer', 'Share at least a few sentences — no names or contact info.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await successStoryService.submitStory({ body: trimmed, city, metVia });
      if (error) Alert.alert('Could not submit', error);
      else {
        Alert.alert(
          'JazakAllah khair',
          'Your story is pending review. We publish anonymously in the app and on wasl.com when approved.'
        );
        setSubmitOpen(false);
        setBody('');
        setCity('');
        setMetVia('match');
      }
    } finally {
      setSubmitting(false);
    }
  }, [body, city, metVia]);

  const featured = useMemo(() => stories[0] || null, [stories]);

  const renderStory = useCallback(({ item, index }) => {
    const colors = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
    const opt = MET_VIA_OPTIONS.find((o) => o.id === item.metVia);
    return (
      <View style={styles.storyWrap}>
        <LinearGradient colors={colors} style={styles.storyCard}>
          <Text style={styles.storyEmoji}>{opt?.emoji || '💕'}</Text>
          <Text style={styles.storyTag}>{item.metViaLabel || 'We met on Wasl'}</Text>
          {item.city ? <Text style={styles.storyCity}>{item.city}</Text> : null}
          <Text style={styles.quoteMark}>“</Text>
          <Text style={styles.storyBody}>{item.body}</Text>
          <Text style={styles.quoteEnd}>”</Text>
        </LinearGradient>
      </View>
    );
  }, []);

  if (submitOpen) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenBackHeader title="Share your story" onBack={() => setSubmitOpen(false)} backLabel="Back" light />
        <HuzzKeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.formHint}>
            Optional and anonymous. No names, @handles, or links. Our team reviews before publishing in the app
            and on the website.
          </Text>
          <Text style={styles.label}>How did you meet?</Text>
          <View style={styles.chipRow}>
            {MET_VIA_OPTIONS.map((opt) => (
              <HuzzPressable
                key={opt.id}
                style={[styles.chip, metVia === opt.id && styles.chipOn]}
                onPress={() => setMetVia(opt.id)}
                haptic="light"
              >
                <Text style={[styles.chipText, metVia === opt.id && styles.chipTextOn]}>
                  {opt.emoji} {opt.label}
                </Text>
              </HuzzPressable>
            ))}
          </View>
          <Text style={styles.label}>City (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Birmingham"
            placeholderTextColor={tokens.colors.textMuted}
            value={city}
            onChangeText={setCity}
          />
          <Text style={styles.label}>Your story</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="We met on Wasl, took things slow with family involved, and..."
            placeholderTextColor={tokens.colors.textMuted}
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
          />
          <RetroButton
            variant="green"
            title={submitting ? 'Submitting…' : 'Submit anonymously'}
            onPress={submit}
            disabled={submitting}
            style={styles.submitBtn}
          />
        </HuzzKeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenBackHeader title="Love stories" onBack={() => onNavigate('matches')} backLabel="Chats" light />
      <FlatList
        data={stories}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderStory}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Heart size={26} color={tokens.colors.brandPink} fill={tokens.colors.brandPink} />
              <Sparkles size={18} color={tokens.colors.brandPink} style={styles.sparkle} />
            </View>
            <Text style={styles.heroTitle}>We met on Wasl</Text>
            <Text style={styles.heroBody}>
              Hopeful, halal love stories — shared anonymously so you can read for fun and faith.
            </Text>
            {featured ? (
              <View style={styles.featuredHint}>
                <Text style={styles.featuredLabel}>Featured</Text>
                <Text style={styles.featuredSnippet} numberOfLines={3}>
                  “{featured.body}”
                </Text>
              </View>
            ) : null}
            <HuzzPressable style={styles.shareBtn} onPress={() => setSubmitOpen(true)} haptic="medium">
              <Text style={styles.shareBtnText}>Share your story ✨</Text>
            </HuzzPressable>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={tokens.colors.accent} style={{ marginTop: 32 }} />
          ) : (
            <Text style={styles.empty}>
              Stories will appear here once approved. Yours could be the first — tap share above.
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  scroll: { flex: 1 },
  formContent: { padding: tokens.spacing.screenHorizontal, paddingBottom: 40, gap: 8 },
  formHint: { ...tokens.typography.caption, color: tokens.colors.textSecondary, lineHeight: 20, marginBottom: 8 },
  label: { ...tokens.typography.label, color: tokens.colors.text, marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  chipOn: { borderColor: tokens.colors.brandPink, backgroundColor: tokens.colors.filterBgRose },
  chipText: { fontSize: 12, fontWeight: '700', color: tokens.colors.textSecondary },
  chipTextOn: { color: tokens.colors.text },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    padding: 12,
    backgroundColor: tokens.colors.surface,
    color: tokens.colors.text,
    fontSize: 15,
  },
  textArea: { minHeight: 140 },
  submitBtn: { marginTop: 16 },
  list: { paddingBottom: 40 },
  hero: {
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 8,
  },
  heroIcon: { position: 'relative', marginBottom: 4 },
  sparkle: { position: 'absolute', right: -14, top: -6 },
  heroTitle: { fontSize: 28, fontWeight: '800', color: tokens.colors.text, textAlign: 'center' },
  heroBody: {
    ...tokens.typography.caption,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 320,
  },
  featuredHint: {
    marginTop: 12,
    padding: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: tokens.colors.border,
    width: '100%',
  },
  featuredLabel: { fontSize: 10, fontWeight: '800', color: tokens.colors.brandPink, textTransform: 'uppercase' },
  featuredSnippet: { fontSize: 14, lineHeight: 21, color: tokens.colors.text, marginTop: 6, fontStyle: 'italic' },
  shareBtn: {
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: tokens.colors.brandPink,
  },
  shareBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  empty: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
    lineHeight: 20,
  },
  storyWrap: { paddingHorizontal: tokens.spacing.screenHorizontal, marginBottom: 16 },
  storyCard: {
    borderRadius: 22,
    padding: 20,
    minHeight: 180,
    borderWidth: 2,
    borderColor: 'rgba(43,36,32,0.1)',
    width: Math.min(SCREEN_W - tokens.spacing.screenHorizontal * 2, 400),
    alignSelf: 'center',
  },
  storyEmoji: { fontSize: 28, marginBottom: 6 },
  storyTag: { fontSize: 11, fontWeight: '800', color: '#831843', textTransform: 'uppercase' },
  storyCity: { fontSize: 13, color: 'rgba(131,24,67,0.8)', marginTop: 2 },
  quoteMark: { fontSize: 42, lineHeight: 42, color: 'rgba(131,24,67,0.35)', marginTop: 8 },
  storyBody: { fontSize: 17, lineHeight: 26, color: '#4A044E', fontWeight: '500' },
  quoteEnd: { fontSize: 28, color: 'rgba(131,24,67,0.35)', alignSelf: 'flex-end', marginTop: 4 },
});
