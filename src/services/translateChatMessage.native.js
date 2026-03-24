/**
 * Native: Google ML Kit on-device translation on Android (free, offline-capable after models download).
 * iOS uses cloud fallback — @react-native-ml-kit/translate-text ships a stub iOS native module.
 * If ML Kit fails (unsupported pair, missing model), falls back to cloud.
 */
import { Platform } from 'react-native';
import IdentifyLanguages from '@react-native-ml-kit/identify-languages';
import TranslateText, { TranslateLanguage } from '@react-native-ml-kit/translate-text';
import { translateChatMessageCloud } from './translateChatMessageCloud';

/** All ML Kit translate language tag strings we can use as source/target */
const ML_KIT_TAGS = new Set(Object.values(TranslateLanguage));

/** Map app chat language codes (see chatLanguages.js) → ML Kit enum string */
const TARGET_BY_CODE = {
  en: TranslateLanguage.ENGLISH,
  es: TranslateLanguage.SPANISH,
  fr: TranslateLanguage.FRENCH,
  de: TranslateLanguage.GERMAN,
  it: TranslateLanguage.ITALIAN,
  pt: TranslateLanguage.PORTUGUESE,
  nl: TranslateLanguage.DUTCH,
  pl: TranslateLanguage.POLISH,
  ru: TranslateLanguage.RUSSIAN,
  uk: TranslateLanguage.UKRAINIAN,
  tr: TranslateLanguage.TURKISH,
  ar: TranslateLanguage.ARABIC,
  hi: TranslateLanguage.HINDI,
  ur: TranslateLanguage.URDU,
  bn: TranslateLanguage.BENGALI,
  ta: TranslateLanguage.TAMIL,
  te: TranslateLanguage.TELUGU,
  id: TranslateLanguage.INDONESIAN,
  ms: TranslateLanguage.MALAY,
  th: TranslateLanguage.THAI,
  vi: TranslateLanguage.VIETNAMESE,
  zh: TranslateLanguage.CHINESE,
  ja: TranslateLanguage.JAPANESE,
  ko: TranslateLanguage.KOREAN,
  fa: TranslateLanguage.PERSIAN,
  he: TranslateLanguage.HEBREW,
  el: TranslateLanguage.GREEK,
  sv: TranslateLanguage.SWEDISH,
  cs: TranslateLanguage.CZECH,
  ro: TranslateLanguage.ROMANIAN,
  hu: TranslateLanguage.HUNGARIAN,
  sw: TranslateLanguage.SWAHILI,
  fil: TranslateLanguage.TAGALOG,
};

function normalizeBcp47(tag) {
  if (!tag || typeof tag !== 'string') return '';
  const t = tag.trim().toLowerCase();
  if (t === 'und' || t === 'unknown') return '';
  const primary = t.split(/[-_]/)[0];
  if (primary === 'zh') return 'zh';
  if (primary === 'in') return 'id';
  if (primary === 'iw') return 'he';
  if (primary === 'fil') return 'tl';
  return primary;
}

function toMlKitLanguageTag(bcp47) {
  const n = normalizeBcp47(bcp47);
  if (!n) return null;
  if (ML_KIT_TAGS.has(n)) return n;
  return null;
}

export async function translateChatMessage(text, targetLang) {
  const t = String(text || '').trim();
  const lang = String(targetLang || 'en').trim().toLowerCase();
  if (!t) return { translatedText: null, error: 'Empty text' };

  if (Platform.OS !== 'android') {
    return translateChatMessageCloud(t, lang);
  }

  const targetTag = TARGET_BY_CODE[lang];
  if (!targetTag) {
    return translateChatMessageCloud(t, lang);
  }

  let sourceTag;
  try {
    const identified = await IdentifyLanguages.identify(t);
    sourceTag = toMlKitLanguageTag(identified);
  } catch {
    return translateChatMessageCloud(t, lang);
  }

  if (!sourceTag) {
    return translateChatMessageCloud(t, lang);
  }

  if (sourceTag === targetTag) {
    return { translatedText: t, error: null };
  }

  try {
    const translatedText = await TranslateText.translate({
      text: t,
      sourceLanguage: sourceTag,
      targetLanguage: targetTag,
      downloadModelIfNeeded: true,
    });
    if (typeof translatedText === 'string' && translatedText.trim()) {
      return { translatedText: translatedText.trim(), error: null };
    }
    return translateChatMessageCloud(t, lang);
  } catch {
    return translateChatMessageCloud(t, lang);
  }
}
