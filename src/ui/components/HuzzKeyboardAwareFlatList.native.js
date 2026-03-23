import React from 'react';
import { KeyboardAwareFlatList } from 'react-native-keyboard-aware-scroll-view';

/**
 * FlatList that keeps the focused field above the keyboard (e.g. search + list).
 */
export function HuzzKeyboardAwareFlatList({ ...props }) {
  return (
    <KeyboardAwareFlatList
      enableOnAndroid
      enableAutomaticScroll
      extraScrollHeight={88}
      extraHeight={32}
      keyboardOpeningTime={250}
      keyboardShouldPersistTaps="handled"
      {...props}
    />
  );
}
