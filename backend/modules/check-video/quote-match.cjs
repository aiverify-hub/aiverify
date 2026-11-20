'use strict';
// Check Video quote binding. Based on the frozen T564 rule (T537 audit output/T564_QUOTE_MATCH_COMBINED/quote-match-t564.cjs)
// plus the exact-first resolution proposed after T564 F2.
// - A quote binds only to the CITED source's SUPPLIED excerpt (never the full page, never another source).
// - Loose comparison canonicalizes only: whitespace runs = one space (ends trimmed); curly single quotes U+2018/U+2019 = ';
//   curly double quotes U+201C/U+201D = ". Nothing else (no case, dash, accent, digit or word changes; no fuzzy matching).
// - Exactly one loose occurrence binds. Zero = unbound.
// - Two or more loose occurrences: bind only if exactly one occurrence matches EXACTLY (whitespace runs still equal);
//   otherwise AMBIGUOUS and blocked.
// - The ORIGINAL excerpt substring is recovered by offsets and kept for display.
const QUOTE_MAP = { '‘': "'", '’': "'", '“': '"', '”': '"' };

function canonical(text, mapQuotes) {
  const s = [], map = []; let inSpace = false, started = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) { if (started) inSpace = true; continue; }
    if (inSpace) { s.push(' '); map.push(i - 1); inSpace = false; }
    s.push(mapQuotes && QUOTE_MAP[ch] ? QUOTE_MAP[ch] : ch); map.push(i); started = true;
  }
  return { s: s.join(''), map: map };
}
function occurrences(hay, needle) { const hits = []; let from = 0; for (;;) { const k = hay.indexOf(needle, from); if (k < 0) break; hits.push(k); from = k + 1; } return hits; }

function bindQuote(quote, excerpt) {
  const qStr = String(quote || ''), eStr = String(excerpt || '');
  const q = canonical(qStr, true).s;
  if (!q) return { bound: false, reason: 'EMPTY_QUOTE' };
  const e = canonical(eStr, true);
  const hits = occurrences(e.s, q);
  if (hits.length === 0) return { bound: false, reason: 'NOT_IN_CITED_EXCERPT' };
  let hit = hits[0], resolvedBy = 'UNIQUE_MATCH';
  if (hits.length > 1) {
    // exact-first: same whitespace rule, no quote-mark mapping. Canonical strings have equal length and aligned offsets
    // (quote mapping is 1:1), so an exact hit is also a loose hit at the same index.
    const qe = canonical(qStr, false).s, ee = canonical(eStr, false);
    const exact = occurrences(ee.s, qe);
    if (exact.length !== 1) return { bound: false, reason: 'AMBIGUOUS_MULTIPLE_MATCHES', count: hits.length, exactCount: exact.length };
    hit = exact[0]; resolvedBy = 'EXACT_FIRST';
  }
  const start = e.map[hit], end = e.map[hit + q.length - 1] + 1, original = eStr.slice(start, end);
  const sq = function (t) { return t.replace(/\s+/g, ' ').trim(); };
  return { bound: true, start: start, end: end, originalSubstring: original, matchType: sq(original) === sq(qStr) ? 'EXACT' : 'TYPOGRAPHY_EQUIVALENT', resolvedBy: resolvedBy };
}
module.exports = { bindQuote, canonical, QUOTE_MAP };
