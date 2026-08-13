import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { HuzzKeyboardAwareFlatList } from '../../ui/components/HuzzKeyboardAwareFlatList.native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Globe2 } from 'lucide-react-native';

import { COUNTRIES } from '../../utils/countries';
import { tokens, brandShellGradientSoft } from '../../ui/tokens';
import { RetroInput } from '../../ui/components/RetroInput.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { authService, userService } from '../../services/firebaseService';
import { Routes } from '../navigation/routes';

const cardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
      }
    : { elevation: 3 };

export function SelectCountryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const selected = String(route.params?.selectedCountry || '').trim();

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.toLowerCase().includes(q));
  }, [search]);

  const persistMatchCountry = async (country) => {
    const authUser = authService.getCurrentUser();
    if (!authUser) return;
    try {
      await userService.updateUser(authUser.uid, { matchCountry: String(country || '').trim() });
    } catch (e) {
      console.warn('[SelectCountry] persist matchCountry failed:', e?.message || e);
    }
  };

  const handleSelect = async (c) => {
    await persistMatchCountry(c);
    // `pop: true` pops the stack back to Filters and drops SelectCountry. Without it,
    // RN stack can leave SelectCountry below Filters so Back shows the country list again.
    navigation.navigate({
      name: Routes.Filters,
      params: { selectedCountry: c },
      merge: true,
      pop: true,
    });
  };

  return (
    <View style={styles.root}>
      {/* Same soft gradient as Filters */}
      <LinearGradient
        colors={brandShellGradientSoft}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.safe}>
        {/* Same header treatment as Filters: white bar merged under status bar */}
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={styles.headerRow}>
            <HuzzPressable style={styles.headerSideBtn} onPress={() => navigation.goBack()} haptic="light">
              <ArrowLeft size={22} color={tokens.colors.text} strokeWidth={2.25} />
            </HuzzPressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>Select country</Text>
            </View>
            <View style={[styles.headerSideBtn, styles.headerRightBtn]} />
          </View>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
        >
        <View style={styles.body}>
          <View style={[styles.searchSection, cardShadow]}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionIconWrap, styles.iconWrapEmerald]}>
                <Globe2 size={20} color="#047857" strokeWidth={2.2} />
              </View>
              <View style={styles.sectionHeadText}>
                <Text style={styles.sectionTitle}>Find your country</Text>
                <Text style={styles.sectionHint}>Search and tap a name to select</Text>
              </View>
            </View>
            <RetroInput
              style={styles.search}
              placeholder="Search countries…"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
          </View>

          <HuzzKeyboardAwareFlatList
            data={filtered}
            keyExtractor={(item) => item}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: tokens.spacing.xl + insets.bottom }}
            renderItem={({ item: c }) => (
              <HuzzPressable
                style={[styles.row, selected === c ? styles.rowSelected : null]}
                onPress={() => handleSelect(c)}
                haptic="light"
              >
                <Text style={[styles.rowText, selected === c && styles.rowTextSelected]}>
                  {c}
                  {selected === c ? '  ✓' : ''}
                </Text>
              </HuzzPressable>
            )}
          />
        </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.filterBgRose,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
    paddingHorizontal: tokens.spacing.sm,
    paddingBottom: tokens.spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  headerSideBtn: {
    minWidth: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  headerRightBtn: {
    minWidth: 76,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.colors.text,
    letterSpacing: -0.3,
  },
  body: {
    flex: 1,
    padding: tokens.spacing.md,
  },
  searchSection: {
    backgroundColor: tokens.colors.filterBgEmerald,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderEmerald,
    padding: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapEmerald: {
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
  },
  sectionHeadText: {
    flex: 1,
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.colors.text,
    letterSpacing: -0.2,
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  search: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: tokens.radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    padding: 14,
    ...tokens.typography.body,
    color: tokens.colors.text,
  },
  list: {
    flex: 1,
  },
  row: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: tokens.radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
    }),
  },
  rowSelected: {
    backgroundColor: 'rgba(225, 29, 72, 0.12)',
    borderColor: tokens.colors.accent,
    borderWidth: 2,
  },
  rowText: {
    ...tokens.typography.body,
    color: tokens.colors.text,
    fontWeight: '500',
  },
  rowTextSelected: {
    color: tokens.colors.accentPressed,
    fontWeight: '700',
  },
});
