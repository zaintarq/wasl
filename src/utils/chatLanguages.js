/**
 * BCP-47 language codes supported for chat translation (ML Kit on Android + MyMemory callable allowlist).
 * Keep in sync with Cloud Function CHAT_TRANSLATE_LANGS.
 */
export const CHAT_TRANSLATE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ur', label: 'Urdu' },
  { code: 'bn', label: 'Bengali' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ms', label: 'Malay' },
  { code: 'th', label: 'Thai' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'zh', label: 'Chinese (Simplified)' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'fa', label: 'Persian' },
  { code: 'he', label: 'Hebrew' },
  { code: 'el', label: 'Greek' },
  { code: 'sv', label: 'Swedish' },
  { code: 'cs', label: 'Czech' },
  { code: 'ro', label: 'Romanian' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'sw', label: 'Swahili' },
  { code: 'fil', label: 'Filipino' },
];

export function getChatLanguageLabel(code) {
  const c = String(code || '').trim().toLowerCase();
  return CHAT_TRANSLATE_LANGUAGES.find((x) => x.code === c)?.label || c || 'English';
}
