import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronRight, Globe2 } from 'lucide-react-native';
import * as Location from 'expo-location';

import { tokens } from '../../ui/tokens';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { authService, userService } from '../../services/firebaseService';
import { Routes } from '../navigation/routes';

const USE_MOCK_DATA = false;

export function FiltersScreen({ onNavigate }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const initial = route.params?.initial || {};

  const [me, setMe] = useState(null);
  const [matchCountry, setMatchCountry] = useState(String(initial.matchCountry || '').trim());

  const myCountry = useMemo(
    () => String(me?.country || me?.countryOfResidence || '').trim(),
    [me]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (USE_MOCK_DATA) return;
      const authUser = authService.getCurrentUser();
      if (!authUser) return;
      try {
        const snap = await userService.getUserById(authUser.uid);
        const profile = snap?.data || null;
        if (cancelled || !profile) return;
        setMe(profile);
        if (route.params?.initial == null) {
          setMatchCountry(String(profile.matchCountry || '').trim());
        }
      } catch (e) {
        console.warn('[FiltersScreen] load profile:', e?.message || e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const selected = route.params?.selectedCountry;
    if (selected === undefined || selected === null) return;
    setMatchCountry(String(selected).trim());
    navigation.setParams({ selectedCountry: undefined });
  }, [route.params?.selectedCountry, navigation]);

  const persistMatchCountry = async (country) => {
    const authUser = authService.getCurrentUser();
    if (!authUser) return;
    try {
      await userService.updateUser(authUser.uid, { matchCountry: String(country || '').trim() });
    } catch (e) {
      console.warn('Persist matchCountry failed:', e?.message || e);
    }
  };

  const updateMyCountryFromGPS = async () => {
    const authUser = authService.getCurrentUser();
    if (!authUser) {
      onNavigate?.('onboarding', { mode: 'login' });
      return;
    }
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location to detect country');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const geos = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const country = String(geos?.[0]?.country || '').trim();
      if (!country) {
        Alert.alert('Oops', 'Select your country manually');
        return;
      }
      await userService.updateUser(authUser.uid, {
        country,
        countryOfResidence: country,
        matchCountry: country,
      });
      setMe((prev) => ({ ...(prev || {}), country, countryOfResidence: country, matchCountry: country }));
      setMatchCountry(country);
    } catch (e) {
      console.warn('updateMyCountryFromGPS error:', e?.message || e);
      Alert.alert('Oops', 'Select country manually');
    }
  };

  const clearAll = () => {
    const reset = myCountry;
    if (reset) {
      setMatchCountry(reset);
      persistMatchCountry(reset);
    } else {
      setMatchCountry('');
      persistMatchCountry('');
    }
  };

  const countrySummary = matchCountry || myCountry || 'No preference';

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#FFF5F7', '#EFF6FF', '#F0FDFA']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.safe}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={styles.headerRow}>
            <HuzzPressable style={styles.headerSideBtn} onPress={() => navigation.goBack()} haptic="light">
              <ArrowLeft size={22} color={tokens.colors.text} strokeWidth={2.25} />
            </HuzzPressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>Filters</Text>
            </View>
            <HuzzPressable style={[styles.headerSideBtn, styles.headerRightBtn]} onPress={clearAll} haptic="light">
              <Text style={styles.clearText}>Clear all</Text>
            </HuzzPressable>
          </View>
        </View>

        <HuzzKeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tokens.spacing.xl + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.filterSection, styles.sectionLocation]}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionIconWrap, styles.iconWrapEmerald]}>
                <Globe2 size={20} color="#047857" strokeWidth={2.2} />
              </View>
              <View style={styles.sectionHeadText}>
                <Text style={styles.sectionTitle}>Location</Text>
                <Text style={styles.sectionHint}>Limit discovery by country</Text>
              </View>
            </View>
            <Text style={styles.modalSubValue}>{countrySummary}</Text>
            <HuzzPressable
              style={styles.countryTrigger}
              onPress={() =>
                navigation.navigate(Routes.SelectCountry, {
                  selectedCountry: matchCountry || '',
                })
              }
              haptic="light"
            >
              <Text style={styles.countryTriggerText} numberOfLines={1}>
                {matchCountry ? matchCountry : 'Choose country…'}
              </Text>
              <ChevronRight size={20} color={tokens.colors.accent} />
            </HuzzPressable>
            <Text style={styles.countryHint}>Full-screen country list</Text>
          </View>

          <View style={styles.filterFooterRow}>
            <View style={{ flex: 1 }}>
              <RetroButton variant="gray" onPress={() => navigation.goBack()} title="Done" />
            </View>
            <View style={{ flex: 1 }}>
              <RetroButton
                variant="blue"
                onPress={() => {
                  const c = String(myCountry || '').trim();
                  setMatchCountry(c);
                  persistMatchCountry(c);
                }}
                title="Use my country"
              />
            </View>
          </View>

          {!USE_MOCK_DATA && (
            <View style={styles.filterGpsBlock}>
              <RetroButton variant="blue" onPress={updateMyCountryFromGPS} title="Update my country from GPS" />
            </View>
          )}
        </HuzzKeyboardAwareScrollView>
      </View>
    </View>
  );
}

const cardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
      }
    : { elevation: 3 };

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
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.md,
    minHeight: 48,
  },
  headerSideBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
  },
  headerRightBtn: {
    alignItems: 'flex-end',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  clearText: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colors.accent,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapEmerald: { backgroundColor: 'rgba(16, 185, 129, 0.22)' },
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
  filterSection: {
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    marginBottom: 0,
    ...cardShadow,
  },
  sectionLocation: {
    backgroundColor: tokens.colors.filterBgEmerald,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderEmerald,
  },
  modalSubValue: {
    ...tokens.typography.bodySmall,
    color: tokens.colors.textSecondary,
    marginBottom: 10,
    fontWeight: '500',
  },
  countryTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: tokens.radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  countryTriggerText: {
    ...tokens.typography.body,
    color: tokens.colors.text,
    flex: 1,
    marginRight: 8,
    fontWeight: '600',
  },
  countryHint: {
    ...tokens.typography.caption,
    color: tokens.colors.textSecondary,
    marginTop: 8,
    fontWeight: '500',
  },
  filterFooterRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: tokens.spacing.xs,
  },
  filterGpsBlock: {
    marginTop: tokens.spacing.sm,
  },
});
