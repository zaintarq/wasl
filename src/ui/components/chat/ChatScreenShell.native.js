import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../tokens';

/**
 * Simple reliable chat shell: header | messages (flex) | composer dock at bottom.
 */
export function ChatScreenShell({ header, list, dock, onDockLayout }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      {header ? <View style={styles.headerSlot}>{header}</View> : null}

      <KeyboardAvoidingView
        style={styles.body}
        behavior="padding"
        enabled={Platform.OS === 'ios'}
      >
        <View style={styles.listStage}>{list}</View>
        <View
          style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 8) }]}
          onLayout={onDockLayout}
        >
          {dock}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: tokens.colors.bg,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  headerSlot: {
    flexShrink: 0,
    backgroundColor: tokens.colors.bg,
  },
  listStage: {
    flex: 1,
    minHeight: 0,
  },
  dock: {
    flexShrink: 0,
    width: '100%',
    backgroundColor: tokens.colors.bg,
  },
});
