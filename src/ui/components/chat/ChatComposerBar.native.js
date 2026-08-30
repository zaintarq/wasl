import React from 'react';
import { View, TextInput, StyleSheet, Platform } from 'react-native';
import { tokens } from '../../tokens';

/**
 * WhatsApp-style composer row: pill input + trailing actions slot.
 */
export function ChatComposerBar({
  value,
  onChangeText,
  onContentSizeChange,
  placeholder = 'Message',
  editable = true,
  inputRef,
  leading,
  trailing,
  minHeight = 40,
  maxHeight = 120,
  inputHeight = 40,
}) {
  return (
    <View style={styles.row}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.inputWrap}>
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              height: Math.max(minHeight, Math.min(maxHeight, inputHeight)),
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={tokens.colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          multiline
          scrollEnabled
          textAlignVertical="center"
          underlineColorAndroid="transparent"
          onContentSizeChange={onContentSizeChange}
        />
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: tokens.colors.surface,
  },
  leading: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingBottom: 2,
  },
  trailing: {
    flexShrink: 0,
    paddingBottom: 2,
  },
  inputWrap: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  input: {
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.border,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 16,
    lineHeight: 20,
    color: tokens.colors.text,
    maxHeight: 120,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
});
