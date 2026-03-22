function normalize(text) {
  return String(text || '').toLowerCase();
}

// Lightweight keyword moderation (V1). This is not ML — it’s a fast “mediator” gate.
// You can extend categories/terms anytime.
const RULES = [
  { cat: 'sexual', terms: ['cum', 'semen', 'sex', 'blowjob', 'handjob', 'porn', 'nudes', 'dick', 'pussy'] },
  { cat: 'harassment', terms: ['fuck', 'fuk', 'bitch', 'slut', 'whore'] },
];

export function scanMessageText(text) {
  const t = normalize(text);
  if (!t) return { flagged: false, categories: [], matchedTerms: [], score: 0 };

  const matchedTerms = [];
  const categories = new Set();

  for (const r of RULES) {
    for (const term of r.terms) {
      if (!term) continue;
      // word-ish boundary; still catches most cases
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

