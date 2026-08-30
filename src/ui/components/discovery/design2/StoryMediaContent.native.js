import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';

function StoryVideoPlayer({ uri, active }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (!uri) return undefined;
    if (active) {
      player.play();
    } else {
      player.pause();
    }
    return () => {
      try {
        player.pause();
      } catch {
        /* ignore */
      }
    };
  }, [active, uri, player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
    />
  );
}

export function StoryMediaContent({ story, active = true }) {
  const url = String(story?.mediaUrl || '');
  const isVideo = String(story?.mediaType || 'image') === 'video';

  if (!url) return null;

  if (isVideo) {
    return <StoryVideoPlayer uri={url} active={active} />;
  }

  return (
    <Image
      source={{ uri: url }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      transition={180}
    />
  );
}
