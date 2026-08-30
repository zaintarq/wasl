import React, { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { ChevronRight, MoreVertical } from 'lucide-react-native';
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

export function ChatMatchCard({ other, match, canChat, onPress, onRemove }) {
  const name = other?.name || other?.username || 'Connection';
  const displayName = other?.username ? `@${other.username}` : name;
  const preview = String(match?.lastMessageText || '').trim();
  const presence = getPresenceDisplay(other?.lastSeen);
  const meta = preview
    ? preview.length > 48
      ? `${preview.slice(0, 48)}…`
      : preview
    : canChat
      ? 'New match — say hi!'
      : 'Waiting for match';

  return (
    <View style={[styles.wrap, !canChat && styles.wrapDisabled]}>
      <HuzzPressable
        style={styles.mainTap}
        onPress={onPress}
        haptic="light"
        disabled={!canChat}
        accessibilityRole="button"
        accessibilityLabel={canChat ? `Open chat with ${displayName}` : `${displayName}, waiting for match`}
        accessibilityState={{ disabled: !canChat }}
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
              <LiveText style={styles.pending}>Waiting</LiveText>
            )}
          </View>
        </View>
      </HuzzPressable>
      {canChat && onRemove ? (
        <HuzzPressable
          style={styles.moreBtn}
          onPress={onRemove}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel={`Remove connection with ${displayName}`}
        >
          <MoreVertical size={18} color={tokens.colors.textMutedOnBrand} strokeWidth={2.2} />
        </HuzzPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  wrapDisabled: { opacity: 0.72 },
  mainTap: { flex: 1, minWidth: 0 },
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
    fontSize: 13,
    color: tokens.colors.textMutedOnBrand,
    marginTop: 4,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  moreBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -4,
  },
  actionText: {
    ...tokens.typography.label,
    color: tokens.colors.textOnBrand,
  },
  pending: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textMutedOnBrand,
  },
});
