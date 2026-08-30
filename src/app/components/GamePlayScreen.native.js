import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { ArrowLeft } from 'lucide-react-native';
import { fetchGameLaunchSession } from '../../services/gameSessionService';
import { getGameById } from '../../config/gamesCatalog';
import { tokens } from '../../ui/tokens';
import { shellStyles } from '../../ui/styles/shellStyles.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';

function buildDemoHtml(gameTitle, opponentName, reason) {
  const friend = opponentName ? `<p class="friend">Room with <strong>${opponentName}</strong></p>` : '';
  const hint =
    reason === 'missing_games_client_url'
      ? 'Set GAMES_CLIENT_URL in Cloud Functions and EXPO_PUBLIC_GAMES_CLIENT_URL in .env, then run the Colyseus server.'
      : 'Set GAME_SESSION_SECRET in Cloud Functions (same value as the Colyseus server).';
  return `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>
  *{box-sizing:border-box} body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(160deg,#FBCFE8 0%,#F9A8D4 100%);font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#831843;padding:24px;text-align:center}
  .card{background:rgba(255,255,255,.72);border-radius:20px;padding:28px 22px;max-width:340px;border:2px solid #2B2420}
  h1{font-size:22px;margin:0 0 8px} p{margin:8px 0;line-height:1.45;font-size:14px;opacity:.88}
  .friend{margin-top:12px;padding:10px;border-radius:12px;background:rgba(43,36,32,.08);font-size:13px}
  .badge{display:inline-block;margin-top:14px;padding:8px 14px;border-radius:999px;background:#2B2420;color:#F7F1E8;font-size:12px;font-weight:700}
</style></head><body><div class="card"><h1>${gameTitle}</h1><p>Colyseus + Phaser stack is ready. ${hint}</p>${friend}<span class="badge">Colyseus multiplayer ✓</span></div></body></html>`;
}

export function GamePlayScreen({ onNavigate, gameId, opponentUid, opponentName, roomId, matchId }) {
  const game = useMemo(() => getGameById(gameId) || { title: 'Game', id: gameId }, [gameId]);
  const [launchUrl, setLaunchUrl] = useState(null);
  const [demoHtml, setDemoHtml] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await fetchGameLaunchSession({
      gameId: game.id,
      opponentUid,
      roomId,
      matchId,
    });
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    if (data?.launchUrl) {
      setLaunchUrl(String(data.launchUrl));
      setDemoHtml(null);
    } else if (data?.demoMode) {
      setLaunchUrl(null);
      setDemoHtml(buildDemoHtml(game.title, opponentName || data?.opponentName, data?.reason));
    } else {
      setError('Could not start game session.');
    }
    setLoading(false);
  }, [game.id, game.title, opponentName, opponentUid, roomId, matchId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={shellStyles.header}>
        <View style={shellStyles.headerSide}>
          <HuzzPressable
            style={shellStyles.headerBtn}
            onPress={() => onNavigate('social')}
            haptic="light"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={22} color={tokens.colors.textOnBrand} strokeWidth={2.2} />
          </HuzzPressable>
        </View>
        <Text style={shellStyles.headerTitle} numberOfLines={1}>
          {game.title}
        </Text>
        <View style={shellStyles.headerSide} />
      </View>

      {opponentName ? (
        <View style={styles.opponentBar}>
          <Text style={styles.opponentText}>With {opponentName.split(' ')[0]}</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={tokens.colors.brandPink} />
            <Text style={styles.loadingText}>Loading game…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
            <HuzzPressable style={styles.retryBtn} onPress={loadSession} haptic="light">
              <Text style={styles.retryText}>Try again</Text>
            </HuzzPressable>
          </View>
        ) : (
          <WebView
            source={demoHtml ? { html: demoHtml } : { uri: launchUrl }}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            cacheEnabled
            startInLoadingState
            onError={(e) => {
              setError(e?.nativeEvent?.description || 'Could not load game.');
              setLaunchUrl(null);
            }}
            onHttpError={(e) => {
              if (e?.nativeEvent?.statusCode >= 400) {
                setError(`Game server error (${e.nativeEvent.statusCode}). Try again.`);
                setLaunchUrl(null);
              }
            }}
            renderLoading={() => (
              <View style={styles.webLoading}>
                <ActivityIndicator size="large" color={tokens.colors.brandPink} />
              </View>
            )}
            originWhitelist={['*']}
            setSupportMultipleWindows={false}
            androidLayerType="hardware"
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
  },
  opponentBar: {
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingBottom: 6,
  },
  opponentText: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.textMutedOnBrand,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  webLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: tokens.colors.textOnBrand,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 14,
    color: tokens.colors.textOnBrand,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#2B2420',
  },
  retryText: {
    color: '#F7F1E8',
    fontWeight: '700',
    fontSize: 14,
  },
});
