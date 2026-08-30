import React from 'react';
import { View, TextInput, StyleSheet, Platform, Text } from 'react-native';
import { Send } from 'lucide-react-native';
import { HuzzPressable } from '../HuzzPressable.native';
import { tokens } from '../../tokens';

/**
 * Chat composer bar — always visible above the home indicator / keyboard.
 */
export function WhatsAppChatComposer({
  value,
  onChangeText,
  onContentSizeChange,
  placeholder = 'Message',
  editable = true,
  inputHeight = 40,
  showEmojiKeyboard = false,
  onToggleEmoji,
  onSend,
  onStartRecording,
  canSend = false,
  sendDisabled = false,
}) {
  const showSend = canSend && String(value || '').trim().length > 0;

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <HuzzPressable
          style={styles.sideBtn}
          onPress={onToggleEmoji}
          haptic="light"
          accessibilityLabel="Emoji"
        >
          <Text style={styles.emojiIcon}>{showEmojiKeyboard ? '⌨️' : '😊'}</Text>
        </HuzzPressable>

        <View style={styles.inputShell}>
          <TextInput
            style={[
              styles.input,
              { height: Math.max(40, Math.min(100, inputHeight)) },
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

        {showSend ? (
          <HuzzPressable
            style={[styles.sendCircle, sendDisabled && styles.sendDisabled]}
            onPress={onSend}
            disabled={sendDisabled}
            haptic="light"
            accessibilityLabel="Send message"
          >
            <Send size={18} color="#FFFFFF" strokeWidth={2.4} />
          </HuzzPressable>
        ) : (
          <HuzzPressable
            style={styles.micCircle}
            onPress={onStartRecording}
            haptic="light"
            accessibilityLabel="Record voice note"
          >
            <Text style={styles.micIcon}>🎤</Text>
          </HuzzPressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: tokens.colors.bg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  sideBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emojiIcon: {
    fontSize: 22,
  },
  inputShell: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: tokens.colors.surface,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.border,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
  },
  input: {
    fontSize: 16,
    lineHeight: 20,
    color: tokens.colors.text,
    padding: 0,
    margin: 0,
    maxHeight: 100,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  sendCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.brandPink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.45,
  },
  micCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIcon: {
    fontSize: 20,
  },
});
