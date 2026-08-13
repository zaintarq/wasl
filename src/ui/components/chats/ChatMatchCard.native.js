import React, { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { shellStyles } from '../../styles/shellStyles.native';
import { HuzzPressable } from '../HuzzPressable.native';
import { FadeInImage } from '../FadeInImage.native';
import { LiveText } from '../live/LiveTypography.native';
import { getProfileImageUrls } from '../../../utils/profileImages';
import { getPresenceDisplay } from '../../../utils/presence';

function Avatar({ profile, name }) {
  const urls = useMemo(() => getProfileImageUrls(profile), [profile]);
  const initial = String(name || '?').trim().charAt(0).toUpperCase() || '?';

  if (urls[0]) {
    return (
      <FadeInImage
        source={{ uri: urls[0] }}
        style={styles.avatarImg}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={[styles.avatarImg, styles.avatarFallback]}>
      <Text style={styles.avatarInitial}>{initial}</Text>
    </View>
  );
}

export function ChatMatchCard({ other, match, canChat, onPress }) {
  const name = other?.name || other?.username || 'Connection';
  const displayName = other?.username ? `@${other.username}` : name;
  const preview = String(match?.lastMessageText || '').trim();
  const presence = getPresenceDisplay(other?.lastSeen);
  const meta = preview
    ? preview.length > 48
      ? `${preview.slice(0, 48)}…`
      : preview
    : canChat
      ? presence?.label || 'Tap to chat'
      : 'Waiting for match';

  return (
    <HuzzPressable
      style={[styles.wrap, !canChat && styles.wrapDisabled]}
      onPress={onPress}
      haptic="light"
      disabled={!canChat}
    >
      <View style={shellStyles.listRow}>
        <Avatar profile={other} name={name} />

        <View style={styles.body}>
          <LiveText style={styles.name} numberOfLines={1}>
            {displayName}
          </LiveText>
          <LiveText style={styles.meta} numberOfLines={1}>
            {meta}
          </LiveText>
        </View>

        <View style={styles.action}>
          {canChat ? (
            <>
              <LiveText style={styles.actionText}>Open</LiveText>
              <ChevronRight size={18} color={tokens.colors.textOnBrand} strokeWidth={2.5} />
            </>
          ) : (
            <LiveText style={styles.pending}>⏳</LiveText>
          )}
        </View>
      </View>
    </HuzzPressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 0 },
  wrapDisabled: { opacity: 0.72 },
  avatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
  },
  avatarFallback: {
    backgroundColor: tokens.colors.filterBgRose,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderRose,
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: tokens.colors.accent,
  },
  body: { flex: 1, minWidth: 0 },
  name: {
    ...tokens.typography.label,
    fontSize: 16,
    color: tokens.colors.textOnBrand,
  },
  meta: {
    ...tokens.typography.caption,
    color: tokens.colors.textMutedOnBrand,
    marginTop: 4,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionText: {
    ...tokens.typography.label,
    color: tokens.colors.textOnBrand,
  },
  pending: {
    fontSize: 18,
  },
});
