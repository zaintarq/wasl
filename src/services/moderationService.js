function normalize(text) {
  return String(text || '').toLowerCase();
}

// Lightweight keyword moderation (V1). This is not ML — it’s a fast “mediator” gate.
// Keep keyword lists in sync with functions/messageModeration.js
const RULES = [
  { cat: 'sexual', terms: ['cum', 'semen', 'sex', 'blowjob', 'handjob', 'porn', 'nudes', 'dick', 'pussy'] },
  { cat: 'harassment', terms: ['fuck', 'fuk', 'bitch', 'slut', 'whore'] },
];

let profanityFilter = null;

function getProfanityFilter() {
  if (!profanityFilter) {
    const { Filter } = require('bad-words');
    profanityFilter = new Filter();
  }
  return profanityFilter;
}

export function scanMessageText(text) {
  const t = normalize(text);
  if (!t) return { flagged: false, categories: [], matchedTerms: [], score: 0 };

  const matchedTerms = [];
  const categories = new Set();

  for (const r of RULES) {
    for (const term of r.terms) {
      if (!term) continue;
      const re = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
      if (re.test(t)) {
        matchedTerms.push(term);
        categories.add(r.cat);
      }
    }
  }

  const uniqTerms = Array.from(new Set(matchedTerms));
  const cats = Array.from(categories);
  const score = uniqTerms.length + cats.length;

  return { flagged: score > 0, categories: cats, matchedTerms: uniqTerms, score };
}

/** Mirrors server isMessageToxic (bad-words profanity filter). */
export function isMessageToxic(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  try {
    return getProfanityFilter().isProfane(trimmed);
  } catch {
    return scanMessageText(trimmed).flagged;
  }
}

/**
 * Full local moderation gate — profanity + keywords.
 * Used when Cloud Functions are unavailable (fail-closed for toxic content).
 */
export function isMessageToxicLocal(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  if (isMessageToxic(trimmed)) return true;
  return scanMessageText(trimmed).flagged;
}

/** Keyword + profanity scan with moderation metadata (for send-path tagging). */
export function moderateMessageText(text) {
  const trimmed = String(text || '').trim();
  const keywordMod = scanMessageText(trimmed);
  if (isMessageToxic(trimmed)) {
    const categories = new Set(keywordMod.categories);
    categories.add('profanity');
    return {
      flagged: true,
      categories: Array.from(categories),
      matchedTerms: keywordMod.matchedTerms,
      score: Math.max(keywordMod.score, 1),
    };
  }
  return keywordMod;
}
