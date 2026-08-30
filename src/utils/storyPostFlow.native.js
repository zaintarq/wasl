import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export const STORY_VIDEO_MAX_SEC = 30;

function pickStoryMediaType() {
  return new Promise((resolve) => {
    Alert.alert('Add story', 'Choose a photo or a video (up to 30 seconds).', [
      { text: 'Photo', onPress: () => resolve('image') },
      { text: 'Video', onPress: () => resolve('video') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

/** @returns {Promise<{ uri: string, mediaType: 'image'|'video', durationMs?: number }|null>} */
export async function pickStoryMedia() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Photos & videos', 'Allow library access to post a story.');
    return null;
  }

  const kind = await pickStoryMediaType();
  if (!kind) return null;

  if (kind === 'image') {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType?.Images ? [ImagePicker.MediaType.Images] : 'images',
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return null;
    return { uri: result.assets[0].uri, mediaType: 'image' };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaType?.Videos ? [ImagePicker.MediaType.Videos] : 'videos',
    allowsEditing: true,
    videoMaxDuration: STORY_VIDEO_MAX_SEC,
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;

  const asset = result.assets[0];
  const durationMs = Math.round(Number(asset.duration || 0) * 1000);
  if (durationMs > STORY_VIDEO_MAX_SEC * 1000 + 500) {
    Alert.alert('Too long', `Videos must be ${STORY_VIDEO_MAX_SEC} seconds or less.`);
    return null;
  }

  return {
    uri: asset.uri,
    mediaType: 'video',
    durationMs: durationMs > 0 ? durationMs : STORY_VIDEO_MAX_SEC * 1000,
  };
}
