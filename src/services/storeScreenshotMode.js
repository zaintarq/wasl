/**
 * Staff/admin-only Play Store screenshot mode.
 * Disables screenshot blocking and lets admins browse app screens with a capture bar.
 */
import * as ScreenCapture from 'expo-screen-capture';
import { Platform } from 'react-native';

const MODE_KEY = 'wasl-store-screenshot-mode';
const listeners = new Set();

let active = false;
let meta = {
  label: 'Studio',
  homeRoute: 'admin',
  onStudio: true,
};

export const STORE_SCREENSHOT_TARGETS = [
  { id: 'welcome', label: 'Welcome', nav: 'welcome' },
  { id: 'onboarding-signup', label: 'Sign up', nav: 'onboarding', params: { mode: 'signup' } },
  { id: 'onboarding-login', label: 'Log in', nav: 'onboarding', params: { mode: 'login' } },
  { id: 'home', label: 'Discovery / Home', nav: 'home' },
  { id: 'filters', label: 'Discovery filters', nav: 'filters' },
  { id: 'matches', label: 'Matches', nav: 'matches' },
  { id: 'social', label: 'Social feed', nav: 'social' },
  { id: 'profile', label: 'My profile', nav: 'myProfile' },
  { id: 'live', label: 'Live random', nav: 'liveRandom' },
  { id: 'clubs', label: 'Clubs', nav: 'clubs' },
  { id: 'create-club', label: 'Create club', nav: 'createClub' },
  { id: 'settings', label: 'Settings', nav: 'settings' },
  { id: 'notifications', label: 'Notifications', nav: 'notifications' },
  { id: 'verification', label: 'Verification', nav: 'verification' },
  { id: 'age-check', label: 'Age check', nav: 'ageCheck' },
  { id: 'contacts', label: 'Contacts block', nav: 'contacts' },
  { id: 'blocked', label: 'Blocked users', nav: 'blockedUsers' },
];

function emit() {
  const snap = getStoreScreenshotMode();
  listeners.forEach((fn) => {
    try {
      fn(snap);
    } catch {
      /* ignore */
    }
  });
}

export function getStoreScreenshotMode() {
  return { active, ...meta };
}

export function subscribeStoreScreenshotMode(fn) {
  listeners.add(fn);
  fn(getStoreScreenshotMode());
  return () => listeners.delete(fn);
}

export async function setStoreScreenshotMode(nextActive, patch = {}) {
  active = !!nextActive;
  if (patch.label != null) meta.label = String(patch.label);
  if (patch.homeRoute != null) meta.homeRoute = patch.homeRoute === 'staff' ? 'staff' : 'admin';
  if (patch.onStudio != null) meta.onStudio = !!patch.onStudio;

  if (Platform.OS !== 'web') {
    if (active) {
      await ScreenCapture.allowScreenCaptureAsync(MODE_KEY).catch(() => {});
    } else {
      await ScreenCapture.allowScreenCaptureAsync(MODE_KEY).catch(() => {});
    }
  }

  emit();
}

export function isStoreScreenshotModeActive() {
  return active;
}
