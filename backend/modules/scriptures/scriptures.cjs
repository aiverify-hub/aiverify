'use strict';
// Local scripture text for AIVerify (Cary, November 23, 2026: the Scriptures are the main reference; KJV is tier 1, the
// Ethiopian canon tier 2). Source: King James Version 1769 with Apocrypha, public domain, from eBible.org
// (eng-kjv_vpl.zip, 2026-11-15; Crosswire Bible Society). No network use: every verse shown comes from this file.
// Tier 1: the 66 books. Tier 2: the Apocrypha/Deuterocanon books in this file, which are also in the Ethiopian canon.
// User-facing text says "Scriptures" (never the other two words; Cary's rule).
const fs = require('fs'), path = require('path');

const BOOKS = [
  ['GEN', 'Genesis', 1, ['gen', 'ge', 'gn']], ['EXO', 'Exodus', 1, ['exod', 'ex']], ['LEV', 'Leviticus', 1, ['lev', 'lv']], ['NUM', 'Numbers', 1, ['num', 'nm']], ['DEU', 'Deuteronomy', 1, ['deut', 'dt']],
  ['JOS', 'Joshua', 1, ['josh', 'jos']], ['JDG', 'Judges', 1, ['judg', 'jdg']], ['RUT', 'Ruth', 1, ['ru']], ['1SA', '1 Samuel', 1, ['1 sam', '1sam', 'i samuel', 'first samuel']], ['2SA', '2 Samuel', 1, ['2 sam', '2sam', 'ii samuel', 'second samuel']],
  ['1KI', '1 Kings', 1, ['1 kgs', '1kgs', 'i kings', 'first kings']], ['2KI', '2 Kings', 1, ['2 kgs', '2kgs', 'ii kings', 'second kings']], ['1CH', '1 Chronicles', 1, ['1 chron', '1chr', 'i chronicles', 'first chronicles']], ['2CH', '2 Chronicles', 1, ['2 chron', '2chr', 'ii chronicles', 'second chronicles']],
  ['EZR', 'Ezra', 1, ['ezr']], ['NEH', 'Nehemiah', 1, ['neh']], ['EST', 'Esther', 1, ['esth']], ['JOB', 'Job', 1, []], ['PSA', 'Psalms', 1, ['psalm', 'ps', 'psa']], ['PRO', 'Proverbs', 1, ['prov', 'prv', 'pr']],
  ['ECC', 'Ecclesiastes', 1, ['eccl', 'eccles', 'qoheleth']], ['SOL', 'Song of Solomon', 1, ['song of songs', 'song', 'canticles']], ['ISA', 'Isaiah', 1, ['isa']], ['JER', 'Jeremiah', 1, ['jer']], ['LAM', 'Lamentations', 1, ['lam']],
  ['EZE', 'Ezekiel', 1, ['ezek', 'eze']], ['DAN', 'Daniel', 1, ['dan', 'dn']], ['HOS', 'Hosea', 1, ['hos']], ['JOE', 'Joel', 1, []], ['AMO', 'Amos', 1, []], ['OBA', 'Obadiah', 1, ['obad']], ['JON', 'Jonah', 1, ['jon']],
  ['MIC', 'Micah', 1, ['mic']], ['NAH', 'Nahum', 1, ['nah']], ['HAB', 'Habakkuk', 1, ['hab']], ['ZEP', 'Zephaniah', 1, ['zeph']], ['HAG', 'Haggai', 1, ['hag']], ['ZEC', 'Zechariah', 1, ['zech']], ['MAL', 'Malachi', 1, ['mal']],
  ['MAT', 'Matthew', 1, ['matt', 'mt']], ['MAR', 'Mark', 1, ['mk', 'mrk']], ['LUK', 'Luke', 1, ['lk', 'luk']], ['JOH', 'John', 1, ['jn', 'jhn']], ['ACT', 'Acts', 1, ['acts of the apostles']], ['ROM', 'Romans', 1, ['rom']],
  ['1CO', '1 Corinthians', 1, ['1 cor', '1cor', 'i corinthians', 'first corinthians']], ['2CO', '2 Corinthians', 1, ['2 cor', '2cor', 'ii corinthians', 'second corinthians']], ['GAL', 'Galatians', 1, ['gal']], ['EPH', 'Ephesians', 1, ['eph']],
  ['PHI', 'Philippians', 1, ['phil', 'php']], ['COL', 'Colossians', 1, ['col']], ['1TH', '1 Thessalonians', 1, ['1 thess', '1thess', 'i thessalonians', 'first thessalonians']], ['2TH', '2 Thessalonians', 1, ['2 thess', '2thess', 'ii thessalonians', 'second thessalonians']],
  ['1TI', '1 Timothy', 1, ['1 tim', '1tim', 'i timothy', 'first timothy']], ['2TI', '2 Timothy', 1, ['2 tim', '2tim', 'ii timothy', 'second timothy']], ['TIT', 'Titus', 1, ['tit']], ['PHM', 'Philemon', 1, ['philem', 'phm']], ['HEB', 'Hebrews', 1, ['heb']],
  ['JAM', 'James', 1, ['jas', 'jms']], ['1PE', '1 Peter', 1, ['1 pet', '1pet', 'i peter', 'first peter']], ['2PE', '2 Peter', 1, ['2 pet', '2pet', 'ii peter', 'second peter']], ['1JO', '1 John', 1, ['1 jn', '1jn', 'i john', 'first john']],
  ['2JO', '2 John', 1, ['2 jn', '2jn', 'ii john', 'second john']], ['3JO', '3 John', 1, ['3 jn', '3jn', 'iii john', 'third john']], ['JUD', 'Jude', 1, []], ['REV', 'Revelation', 1, ['rev', 'revelations', 'apocalypse', 'revelation of john']],
  ['TOB', 'Tobit', 2, ['tob']], ['JDT', 'Judith', 2, ['jdt']], ['ESG', 'Esther (Greek)', 2, ['additions to esther']], ['WIS', 'Wisdom of Solomon', 2, ['wisdom', 'wis']], ['SIR', 'Sirach', 2, ['ecclesiasticus', 'ben sira', 'sir']],
  ['BAR', 'Baruch', 2, ['bar']], ['PRA', 'Prayer of Azariah', 2, ['song of the three']], ['SUS', 'Susanna', 2, ['sus']], ['BEL', 'Bel and the Dragon', 2, ['bel']], ['1MA', '1 Maccabees', 2, ['1 macc', '1mac', 'i maccabees', 'first maccabees']],
  ['2MA', '2 Maccabees', 2, ['2 macc', '2mac', 'ii maccabees', 'second maccabees']], ['1ES', '1 Esdras', 2, ['1 esd', 'i esdras', 'first esdras', '3 esdras']], ['PRM', 'Prayer of Manasseh', 2, ['prayer of manasses', 'manasseh']], ['4ES', '2 Esdras', 2, ['2 esd', 'ii esdras', 'second esdras', '4 esdras', '4 ezra']],
  ['ENO', '1 Enoch', 2, ['enoch', 'book of enoch', 'i enoch', 'first enoch', 'ethiopic enoch']]
];
const byCode = new Map(BOOKS.map(b => [b[0], { code: b[0], name: b[1], tier: b[2] }]));
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const alias = new Map();
for (const [code, name, , extra] of BOOKS) for (const a of [name, code].concat(extra)) alias.set(norm(a), code);

let DATA = null;
function load(file) {
  if (DATA && !file) return DATA;
  const verses = new Map(), order = [], index = new Map();
  // 1 Enoch: R. H. Charles, The Book of Enoch (SPCK, 1917), public domain, from Wikisource (one page per chapter, fetched
  // November 23, 2026). A few verses whose numbers were missing on the page are merged into the verse before them.
  const text = file ? fs.readFileSync(file, 'utf8') : ['kjv-vpl.txt', 'enoch-vpl.txt'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([0-9A-Z]{3}) (\d+):(\d+) (.*)$/); if (!m || !byCode.has(m[1])) continue;
    const key = m[1] + ' ' + m[2] + ':' + m[3];
    // Words in [brackets] were supplied by the translators (printed in italics in the KJV); kept marked for checks.
    const marked = m[4].replace(/¶\s*/g, '').replace(/\s+/g, ' ').trim(), clean = marked.replace(/[[\]]/g, '');
    verses.set(key, marked); order.push(key);
    for (const w of new Set(words(clean))) { let a = index.get(w); if (!a) index.set(w, a = []); a.push(order.length - 1); }
  }
  const d = { verses, order, index };
  if (!file) DATA = d;
  return d;
}
const STOP = new Set('the and of to in that for is was he it his with as be they not but shall unto i a all him them their which have will by my me thou thee thy ye you your from are this were when there upon on had so said at or then an also no if out who what our us we she her up one into hath any even let man'.split(' '));
function words(s) { return norm(s).split(' ').filter(w => w.length > 1 && !STOP.has(w)); }

// "1 Timothy 6:10", "1 Tim. 6:10-11", "John 3:16", "Psalm 23", "Genesis 1:1-3" -> list of verse keys (max 30)
function parseRef(ref) {
  const m = String(ref || '').trim().match(/^(.+?)\s*(\d+)(?::(\d+)(?:\s*[-–]\s*(?:(\d+):)?(\d+))?)?\s*$/);
  if (!m) return null;
  const code = alias.get(norm(m[1])); if (!code) return null;
  const ch = +m[2];
  if (!m[3]) return { code, chapter: ch, from: 1, to: 999, toChapter: ch };
  return { code, chapter: ch, from: +m[3], toChapter: m[4] ? +m[4] : ch, to: m[5] ? +m[5] : +m[3] };
}
function lookup(ref, d) {
  d = d || load(); const p = parseRef(ref); if (!p) return [];
  const out = [];
  for (let c = p.chapter; c <= p.toChapter && out.length < 30; c++) {
    const start = c === p.chapter ? p.from : 1, end = c === p.toChapter ? p.to : 999;
    for (let v = start; v <= end && out.length < 30; v++) { const k = p.code + ' ' + c + ':' + v, t = d.verses.get(k); if (t === undefined) { if (v > start) break; continue; } out.push(verse(k, t)); }
  }
  return out;
}
// A named passage plus up to `around` verses before and after it in the same chapter, marked context: true.
function lookupWithContext(ref, around, d) {
  d = d || load(); const p = parseRef(ref); if (!p || p.toChapter !== p.chapter || p.to === 999) return lookup(ref, d).map(v => Object.assign(v, { context: false }));
  const out = [];
  for (let v = Math.max(1, p.from - around); v <= p.to + around; v++) { const k = p.code + ' ' + p.chapter + ':' + v, t = d.verses.get(k); if (t === undefined) continue; out.push(Object.assign(verse(k, t), { context: v < p.from || v > p.to })); }
  return out;
}
function verse(key, marked) { const [code, cv] = key.split(' '), b = byCode.get(code); return { ref: b.name + ' ' + cv, code, tier: b.tier, text: marked.replace(/[[\]]/g, ''), marked }; }

// Phrase search: verses sharing the most uncommon words with the phrase (inverse frequency), best first.
function search(phrase, n, opts) {
  const d = load(), ws = [...new Set(words(phrase))]; if (!ws.length) return [];
  const score = new Map(), N = d.order.length;
  for (const w of ws) { const a = d.index.get(w); if (!a || a.length > N / 20) continue; const idf = Math.log(N / a.length); for (const i of a) score.set(i, (score.get(i) || 0) + idf); }
  const tierMax = opts && opts.tierMax || 2;
  return [...score.entries()].map(([i, s]) => ({ i, s })).sort((a, b) => b.s - a.s)
    .map(x => { const k = d.order[x.i]; return Object.assign(verse(k, d.verses.get(k)), { score: +x.s.toFixed(2) }); })
    .filter(v => v.tier <= tierMax).slice(0, n || 5);
}
module.exports = { load, lookup, lookupWithContext, search, parseRef, BOOKS, bookName: code => (byCode.get(code) || {}).name || null, SOURCE: 'King James Version (1769) with Apocrypha, public domain, eBible.org eng-kjv_vpl 2026-11-15; 1 Enoch, R. H. Charles 1917, public domain, Wikisource' };
