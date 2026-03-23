import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  ChevronRight,
  Users,
  Moon,
  Sparkles,
  Heart,
  Globe2,
} from 'lucide-react-native';
import * as Location from 'expo-location';

import { INTENTS } from '../../utils/intents';
import { STATUSES } from '../../utils/statuses';
import { tokens } from '../../ui/tokens';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { RetroInput } from '../../ui/components/RetroInput.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { authService, userService } from '../../services/firebaseService';
import { saveLocalFilters } from '../../utils/localFilterStorage';
import { Routes } from '../navigation/routes';
const USE_MOCK_DATA = false;

function endOfLocalDay() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function isStatusActive(profile) {
  const status = String(profile?.todayStatus || '').trim();
  if (!status) return false;
  const exp = profile?.todayStatusExpiresAt;
  let ms = null;
  if (typeof exp === 'number') ms = exp;
  else if (exp?.toMillis) ms = exp.toMillis();
  else if (exp instanceof Date) ms = exp.getTime();
  if (!ms) return true;
  return Date.now() < ms;
}

export function FiltersScreen({ onNavigate }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const initial = route.params?.initial || {};

  const [me, setMe] = useState(null);
  const [matchCountry, setMatchCountry] = useState(String(initial.matchCountry || '').trim());
  const [matchIntent, setMatchIntent] = useState(String(initial.matchIntent || '').trim());
  const [todayStatus, setTodayStatus] = useState(String(initial.todayStatus || '').trim());
  const [hotSeatEnabled, setHotSeatEnabled] = useState(!!initial.hotSeatEnabled);
  const [hotSeatP1, setHotSeatP1] = useState(initial.hotSeatP1 || 'You');
  const [hotSeatP2, setHotSeatP2] = useState(initial.hotSeatP2 || 'Friend');
  const [hotSeatTurn, setHotSeatTurn] = useState(initial.hotSeatTurn ?? 0);

  const [tonightMode, setTonightMode] = useState(!!initial.tonightMode);

  const myCountry = useMemo(
    () => String(me?.country || me?.countryOfResidence || '').trim(),
    [me]
  );

  const myCity = useMemo(() => {
    const c = String(me?.city || '').trim();
    if (c) return c;
    const loc = String(me?.location || '').trim();
    if (!loc) return '';
    return String(loc.split(',')[0] || '').trim();
  }, [me]);

  const isTonightWindow = useMemo(() => {
    const d = new Date();
    const h = d.getHours();
    return h >= 21 || h < 2;
  }, []);

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
        // If Home passed `initial`, keep that snapshot; otherwise hydrate from Firestore.
        if (route.params?.initial == null) {
          setMatchCountry(String(profile.matchCountry || '').trim());
          setMatchIntent(String(profile.matchIntent || '').trim());
          const s = String(profile.todayStatus || '').trim();
          const active = s && isStatusActive(profile);
          setTodayStatus(active ? s : '');
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

  // Result from full-screen SelectCountry (stack push, not a modal).
  useEffect(() => {
    const selected = route.params?.selectedCountry;
    if (selected === undefined || selected === null) return;
    setMatchCountry(String(selected).trim());
    navigation.setParams({ selectedCountry: undefined });
  }, [route.params?.selectedCountry, navigation]);

  useEffect(() => {
    if (!tonightMode) return;
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(2, 0, 0, 0);
    if (now.getHours() >= 2) {
      setTonightMode(false);
      return;
    }
    const ms = cutoff.getTime() - now.getTime();
    const t = setTimeout(() => setTonightMode(false), Math.max(500, ms));
    return () => clearTimeout(t);
  }, [tonightMode]);

  const persistLocal = useCallback(() => {
    saveLocalFilters({
      hotSeatEnabled,
      hotSeatP1,
      hotSeatP2,
      hotSeatTurn,
      tonightMode,
    });
  }, [hotSeatEnabled, hotSeatP1, hotSeatP2, hotSeatTurn, tonightMode]);

  useEffect(() => {
    persistLocal();
  }, [persistLocal]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        persistLocal();
      };
    }, [persistLocal])
  );

  const persistMatchCountry = async (country) => {
    const authUser = authService.getCurrentUser();
    if (!authUser) return;
    try {
      await userService.updateUser(authUser.uid, { matchCountry: String(country || '').trim() });
    } catch (e) {
      console.warn('Persist matchCountry failed:', e?.message || e);
    }
  };

  const persistMatchIntent = async (intent) => {
    const authUser = authService.getCurrentUser();
    if (!authUser) return;
    try {
      await userService.updateUser(authUser.uid, { matchIntent: String(intent || '').trim() });
    } catch (e) {
      console.warn('Persist matchIntent failed:', e?.message || e);
    }
  };

  const persistTodayStatus = async (status) => {
    const authUser = authService.getCurrentUser();
    if (!authUser) return;
    const s = String(status || '').trim();
    try {
      await userService.updateUser(authUser.uid, {
        todayStatus: s,
        todayStatusExpiresAt: s ? endOfLocalDay() : null,
      });
    } catch (e) {
      console.warn('Persist todayStatus failed:', e?.message || e);
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
    setMatchIntent('');
    persistMatchIntent('');
    setTodayStatus('');
    persistTodayStatus('');
  };

  const handleBack = () => {
    persistLocal();
    navigation.goBack();
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
        {/* paddingTop: insets.top so header bg runs under status bar / notch — no gap above */}
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={styles.headerRow}>
            <HuzzPressable style={styles.headerSideBtn} onPress={handleBack} haptic="light">
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
        <View style={[styles.filterSection, styles.sectionHotSeat]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIconWrap, styles.iconWrapAmber]}>
              <Users size={20} color="#B45309" strokeWidth={2.2} />
            </View>
            <View style={styles.sectionHeadText}>
              <Text style={styles.sectionTitle}>Hot Seat</Text>
              <Text style={styles.sectionHint}>Take turns swiping with a friend</Text>
            </View>
          </View>
          <Text style={styles.modalSubValue}>{hotSeatEnabled ? `ON • ${hotSeatP1} vs ${hotSeatP2}` : 'Off'}</Text>
          <View style={styles.rowGap}>
            <View style={{ flex: 1 }}>
              <RetroButton
                variant={hotSeatEnabled ? 'green' : 'gray'}
                onPress={() => {
                  setHotSeatEnabled((v) => !v);
                  setHotSeatTurn(0);
                }}
                title={hotSeatEnabled ? 'Disable' : 'Enable'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <RetroButton
                variant="gray"
                onPress={() => {
                  setHotSeatP1('You');
                  setHotSeatP2('Friend');
                  setHotSeatTurn(0);
                }}
                title="Reset"
              />
            </View>
          </View>
          {hotSeatEnabled ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              <RetroInput placeholder="Player 1 name" value={hotSeatP1} onChangeText={setHotSeatP1} />
              <RetroInput placeholder="Player 2 name" value={hotSeatP2} onChangeText={setHotSeatP2} />
            </View>
          ) : null}
        </View>

        <View style={[styles.filterSection, styles.sectionTonight]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIconWrap, styles.iconWrapViolet]}>
              <Moon size={20} color="#6D28D9" strokeWidth={2.2} />
            </View>
            <View style={styles.sectionHeadText}>
              <Text style={styles.sectionTitle}>Tonight mode</Text>
              <Text style={styles.sectionHint}>Free tonight in your city · expires 2am</Text>
            </View>
          </View>
          <Text style={styles.modalSubValue}>
            {tonightMode ? `ON • ${myCity || 'Unknown city'}` : 'Off'}
          </Text>
          <RetroButton
            variant={tonightMode ? 'green' : 'gray'}
            onPress={async () => {
              if (!tonightMode) {
                if (!myCity) {
                  Alert.alert('Need city', 'Set your city first');
                  return;
                }
                if (!isTonightWindow) {
                  Alert.alert('Not yet', 'Active 9pm to 2am');
                  return;
                }
                setTodayStatus('Free tonight');
                await persistTodayStatus('Free tonight');
                setTonightMode(true);
              } else {
                setTonightMode(false);
              }
            }}
            title={tonightMode ? 'Disable Tonight' : 'Enable Tonight'}
          />
        </View>

        <View style={[styles.filterSection, styles.sectionStatus]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIconWrap, styles.iconWrapSky]}>
              <Sparkles size={20} color="#0369A1" strokeWidth={2.2} />
            </View>
            <View style={styles.sectionHeadText}>
              <Text style={styles.sectionTitle}>Daily status</Text>
              <Text style={styles.sectionHint}>Expires at midnight</Text>
            </View>
          </View>
          <Text style={styles.modalSubValue}>{todayStatus || 'Off'}</Text>
          <View style={styles.pillWrap}>
            {STATUSES.map((st) => (
              <HuzzPressable
                key={st}
                style={[styles.statusPill, todayStatus === st ? styles.pillSelected : null]}
                onPress={() => {
                  const next = todayStatus === st ? '' : st;
                  setTodayStatus(next);
                  persistTodayStatus(next);
                }}
                haptic="light"
              >
                <Text style={styles.statusPillText}>{st}</Text>
              </HuzzPressable>
            ))}
          </View>
        </View>

        <View style={[styles.filterSection, styles.sectionIntent]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIconWrap, styles.iconWrapRose]}>
              <Heart size={20} color="#E11D48" strokeWidth={2.2} />
            </View>
            <View style={styles.sectionHeadText}>
              <Text style={styles.sectionTitle}>Intent</Text>
              <Text style={styles.sectionHint}>What you're looking for</Text>
            </View>
          </View>
          <Text style={styles.modalSubValue}>{matchIntent || 'No preference'}</Text>
          <View style={styles.pillWrap}>
            {INTENTS.map((it) => (
              <HuzzPressable
                key={it}
                style={[styles.intentPill, matchIntent === it ? styles.pillSelected : null]}
                onPress={() => {
                  const next = matchIntent === it ? '' : it;
                  setMatchIntent(next);
                  persistMatchIntent(next);
                }}
                haptic="light"
              >
                <Text style={styles.intentPillText}>{it}</Text>
              </HuzzPressable>
            ))}
          </View>
        </View>

        <View style={[styles.filterSection, styles.sectionLocation]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIconWrap, styles.iconWrapEmerald]}>
              <Globe2 size={20} color="#047857" strokeWidth={2.2} />
            </View>
            <View style={styles.sectionHeadText}>
              <Text style={styles.sectionTitle}>Location</Text>
              <Text style={styles.sectionHint}>Limit matches by country</Text>
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
            <RetroButton variant="gray" onPress={handleBack} title="Done" />
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
    alignItems: 'flex-end',
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
  clearText: {
    ...tokens.typography.caption,
    color: tokens.colors.accent,
    fontWeight: '600',
    textAlign: 'right',
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
  iconWrapAmber: { backgroundColor: 'rgba(245, 158, 11, 0.22)' },
  iconWrapViolet: { backgroundColor: 'rgba(139, 92, 246, 0.22)' },
  iconWrapSky: { backgroundColor: 'rgba(14, 165, 233, 0.2)' },
  iconWrapRose: { backgroundColor: 'rgba(225, 29, 72, 0.18)' },
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
  sectionHotSeat: {
    backgroundColor: tokens.colors.filterBgAmber,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderAmber,
  },
  sectionTonight: {
    backgroundColor: tokens.colors.filterBgViolet,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderViolet,
  },
  sectionStatus: {
    backgroundColor: tokens.colors.filterBgSky,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderSky,
  },
  sectionIntent: {
    backgroundColor: tokens.colors.filterBgRose,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderRose,
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
  rowGap: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusPill: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: tokens.radius.full,
    borderWidth: 1.5,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  statusPillText: {
    ...tokens.typography.caption,
    color: tokens.colors.text,
    fontWeight: '600',
  },
  intentPill: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: tokens.radius.full,
    borderWidth: 1.5,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  intentPillText: {
    ...tokens.typography.caption,
    color: tokens.colors.text,
    fontWeight: '600',
  },
  pillSelected: {
    backgroundColor: 'rgba(225, 29, 72, 0.18)',
    borderColor: tokens.colors.accent,
    borderWidth: 2,
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
