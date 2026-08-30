import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { FlatList, Keyboard, Platform } from 'react-native';

/**
 * Inverted message list — keeps newest messages above the composer.
 */
export const ChatMessageList = forwardRef(function ChatMessageList(
  {
    composerInset = 72,
    contentContainerStyle,
    onKeyboardShow,
    ...flatListProps
  },
  ref
) {
  const innerRef = useRef(null);

  useImperativeHandle(ref, () => innerRef.current);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      requestAnimationFrame(() => {
        innerRef.current?.scrollToOffset?.({ offset: 0, animated: true });
        onKeyboardShow?.();
      });
    });
    return () => sub?.remove?.();
  }, [onKeyboardShow]);

  return (
    <FlatList
      ref={innerRef}
      inverted
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      removeClippedSubviews={false}
      maintainVisibleContentPosition={{
        minIndexForVisible: 0,
        autoscrollToTopThreshold: 80,
      }}
      contentContainerStyle={[
        contentContainerStyle,
        { paddingTop: Math.max(12, composerInset + 8) },
      ]}
      {...flatListProps}
    />
  );
});
