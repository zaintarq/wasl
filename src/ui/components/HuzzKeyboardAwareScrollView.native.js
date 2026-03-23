import React from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

/**
 * ScrollView that scrolls focused inputs above the keyboard (iOS + Android).
 * Use for any screen with TextInputs inside a ScrollView.
 */
export function HuzzKeyboardAwareScrollView({ children, ...props }) {
  return (
    <KeyboardAwareScrollView
      enableOnAndroid
      enableAutomaticScroll
      extraScrollHeight={88}
      extraHeight={32}
      keyboardOpeningTime={250}
      keyboardShouldPersistTaps="handled"
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
