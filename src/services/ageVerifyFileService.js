import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { buildAgeVerifyHtml, getZoiVeraApiKey, getZoiVeraAudience } from '../config/ageVerify';

/** HTTPS base so iOS WKWebView gets a secure context (camera + ZoiVera origin). */
export const AGE_VERIFY_WEB_BASE = 'https://zaintarq.github.io/wasl/';

const FILE_NAME = 'huzz-age-verify.html';

function buildInjectedHtml(uid) {
  const apiKey = getZoiVeraApiKey();
  const audience = getZoiVeraAudience();
  const inject = `<script>window.__HUZZ__=${JSON.stringify({ apiKey, uid, audience })};</script>`;
  return inject + buildAgeVerifyHtml();
}

/**
 * iOS (incl. Expo Go): inline HTML + HTTPS baseUrl — required for camera in WKWebView.
 * Android: local file URI (optionally content://).
 */
export async function prepareAgeVerifyWebSource(uid) {
  const html = buildInjectedHtml(uid);

  if (Platform.OS === 'ios') {
    return {
      source: { html, baseUrl: AGE_VERIFY_WEB_BASE },
      cacheKey: `ios-${uid}`,
      readAccessUrl: null,
    };
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('Device storage is unavailable.');
  }

  const fileUri = `${cacheDir}${FILE_NAME}`;
  await FileSystem.writeAsStringAsync(fileUri, html);

  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) {
    throw new Error('Could not write scanner page.');
  }

  let uri = fileUri;
  try {
    uri = await FileSystem.getContentUriAsync(fileUri);
  } catch {
    uri = fileUri;
  }

  return {
    source: { uri },
    cacheKey: uri,
    readAccessUrl: cacheDir,
  };
}

/** @deprecated use prepareAgeVerifyWebSource */
export async function prepareAgeVerifyWebUri(uid) {
  const { source, readAccessUrl } = await prepareAgeVerifyWebSource(uid);
  return {
    webUri: source.uri || AGE_VERIFY_WEB_BASE,
    cacheDir: readAccessUrl,
    fileUri: source.uri,
  };
}
