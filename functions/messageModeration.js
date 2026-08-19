/**
 * Shared text moderation for match chat, club chat, and web client sends.
 * Keep keyword lists in sync with src/services/moderationService.js
 */
function normalize(text) {
  return String(text || '').toLowerCase();
}

const KEYWORD_RULES = [
  { cat: 'sexual', terms: ['cum', 'semen', 'sex', 'blowjob', 'handjob', 'porn', 'nudes', 'dick', 'pussy'] },
  { cat: 'harassment', terms: ['fuck', 'fuk', 'bitch', 'slut', 'whore'] },
];

function isMessageToxic(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  try {
    const Filter = require('bad-words').Filter;
    const filter = new Filter();
    return filter.isProfane(text.trim());
  } catch (e) {
    console.error('[messageModeration] Filter error:', e.message);
    return false;
  }
}

function scanMessageText(text) {
  const t = normalize(text);
  if (!t) return { flagged: false, categories: [], matchedTerms: [], score: 0 };

  const matchedTerms = [];
  const categories = new Set();

  for (const rule of KEYWORD_RULES) {
    for (const term of rule.terms) {
      if (!term) continue;
      const re = new RegExp(
        `(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`,
        'i'
      );
      if (re.test(t)) {
        matchedTerms.push(term);
        categories.add(rule.cat);
      }
    }
  }

  const uniqTerms = [...new Set(matchedTerms)];
  const cats = [...categories];
  const score = uniqTerms.length + cats.length;

  return { flagged: score > 0, categories: cats, matchedTerms: uniqTerms, score };
}

module.exports = {
  isMessageToxic,
  scanMessageText,
};
