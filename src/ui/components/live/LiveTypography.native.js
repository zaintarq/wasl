import React, { createContext, useContext, useMemo } from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';
import { useFonts, KaushanScript_400Regular } from '@expo-google-fonts/kaushan-script';
import { RetroButton } from '../RetroButton.native';

const LiveFontContext = createContext({ fontFamily: null, ready: false });

export const LIVE_KAUSHAN_FONT = 'KaushanScript_400Regular';

export function LiveTypographyProvider({ children }) {
  const [loaded] = useFonts({ KaushanScript_400Regular });
  const value = useMemo(
    () => ({ fontFamily: loaded ? LIVE_KAUSHAN_FONT : null, ready: !!loaded }),
    [loaded]
  );
  return <LiveFontContext.Provider value={value}>{children}</LiveFontContext.Provider>;
}

export function useLiveTypography() {
  return useContext(LiveFontContext);
}

/** All Live screen copy uses Kaushan Script when loaded. */
export function LiveText({ style, ...props }) {
  const { fontFamily } = useLiveTypography();
  return <Text style={[fontFamily ? { fontFamily } : null, style]} {...props} />;
}

export function LiveTextInput({ style, ...props }) {
  const { fontFamily } = useLiveTypography();
  return <TextInput style={[fontFamily ? { fontFamily } : null, style]} {...props} />;
}

/** RetroButton with Kaushan label text. */
export function LiveRetroButton({ textStyle, style, children, ...props }) {
  const { fontFamily, ready } = useLiveTypography();
  return (
    <RetroButton
      {...props}
      style={style}
      textStyle={[ready && fontFamily ? { fontFamily } : null, textStyle]}
    >
      {children}
    </RetroButton>
  );
}

export function liveKaushanTextStyle(extra) {
  return StyleSheet.flatten([{ fontFamily: LIVE_KAUSHAN_FONT }, extra]);
}
