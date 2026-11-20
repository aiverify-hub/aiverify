'use strict';
// Check Video (Phase 1): page text for evidence excerpts.
// Fixes measured in T561/T562: (1) HTML entities are decoded once, after tags are removed, so quotes can be
// matched against what a reader sees; (2) text comes from the page's main content (article/main), with
// navigation, headers, footers, menus and share widgets removed, instead of the first 6,000 raw characters.
// No network. Pure functions.

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', sbquo: '‚', bdquo: '„',
  ndash: '–', mdash: '—', hellip: '…', deg: '°', copy: '©', reg: '®', trade: '™',
  middot: '·', bull: '•', eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', oacute: 'ó',
  uacute: 'ú', iacute: 'í', ntilde: 'ñ', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä',
  szlig: 'ß', frac12: '½', frac14: '¼', frac34: '¾', times: '×', divide: '÷', plusmn: '±',
  pound: '£', euro: '€', yen: '¥', cent: '¢', sect: '§', para: '¶', laquo: '«', raquo: '»',
  prime: '′', Prime: '″', minus: '−', shy: ''
};
// One pass: each entity is decoded exactly once (so "&amp;lt;" becomes "&lt;", not "<"). Unknown/invalid entities stay as written.
function decodeEntities(text) {
  return String(text == null ? '' : text).replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/g, function (m, e) {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : m;
    }
    return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[e] : m;
  });
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const DROP_ALWAYS = new Set(['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'head', 'canvas', 'video', 'audio', 'object', 'math']);
const DROP_CHROME = new Set(['nav', 'header', 'footer', 'aside', 'form', 'button', 'select', 'textarea', 'dialog', 'menu']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'main', 'li', 'ul', 'ol', 'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
  'pre', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'figure', 'figcaption', 'br', 'hr', 'address', 'details', 'summary', 'caption']);
// class/id/role words that mark page chrome rather than content
const CHROME_ATTR = /(?:^|[\s_-])(?:nav|navbar|navigation|menu|breadcrumbs?|site-header|site-footer|masthead|footer|header|sidebar|share|sharing|social|cookie|consent|subscribe|newsletter|related|recommended|promo|advert|ads?|banner|skip-link|pagination|comments?|toolbar|usa-banner|gdpr|paywall|modal|popup)(?:$|[\s_-])/i;
const CHROME_ROLE = /\brole\s*=\s*["']?(?:navigation|banner|contentinfo|search|complementary|dialog|menu|menubar)\b/i;

// Tokenizer: comments, tags, text. Keeps nesting depth so removal of a chrome element removes its whole subtree.
const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/?([A-Za-z][A-Za-z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;

function attrIsChrome(attrs) {
  if (!attrs) return false;
  if (CHROME_ROLE.test(attrs)) return true;
  if (/\baria-hidden\s*=\s*["']?true/i.test(attrs)) return true;
  if (/\bhidden(?:\s|=|$)/i.test(attrs) && !/\bhidden\s*=\s*["']?false/i.test(attrs)) return true;
  const m = attrs.match(/\b(?:class|id)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi);
  if (!m) return false;
  return m.some(function (a) { const v = a.replace(/^[^=]*=\s*/, '').replace(/^["']|["']$/g, ''); return CHROME_ATTR.test(' ' + v + ' '); });
}

// Returns visible text with block boundaries as newlines. options.chrome=false keeps nav/header/footer.
function htmlToText(html, options) {
  const o = options || {}, dropChrome = o.chrome !== false, dropByAttr = dropChrome && o.attrs !== false;
  const src = String(html || '');
  const out = [];
  let skipTag = null, skipDepth = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src)) !== null) {
    const tok = m[0];
    if (tok[0] !== '<' || tok === '<') { if (!skipTag) out.push(tok === '<' ? '<' : tok); continue; }
    if (!m[1]) continue; // comment, doctype, cdata
    const name = m[1].toLowerCase(), closing = tok[1] === '/', selfClosing = /\/\s*>$/.test(tok) || VOID.has(name);
    if (skipTag) {
      if (name === skipTag && !selfClosing) { if (closing) { if (--skipDepth === 0) skipTag = null; } else skipDepth++; }
      continue;
    }
    if (!closing && !selfClosing && (DROP_ALWAYS.has(name) || (dropChrome && (DROP_CHROME.has(name) || (dropByAttr && name !== 'body' && name !== 'html' && name !== 'main' && name !== 'article' && attrIsChrome(m[2])))))) {
      skipTag = name; skipDepth = 1; continue;
    }
    if (BLOCK.has(name)) out.push('\n');
    else if (name === 'td' || name === 'th') out.push(' ');
  }
  const text = decodeEntities(out.join(''));
  return text.split('\n').map(function (l) { return l.replace(/[ \t\f\v ​]+/g, ' ').trim(); }).filter(Boolean).join('\n');
}

// Finds the outermost <article>/<main>/role=main element with the most text; falls back to <body>.
function mainRegion(html) {
  const src = String(html || '');
  const spans = [];
  for (const tag of ['article', 'main']) {
    const re = new RegExp('<' + tag + '\\b[^>]*>', 'gi'); let m;
    while ((m = re.exec(src)) !== null) { const end = matchingClose(src, m.index, tag); if (end > m.index) spans.push({ start: m.index, end: end }); }
  }
  const roleRe = /<([a-z][a-z0-9]*)\b[^>]*\brole\s*=\s*["']?main\b[^>]*>/gi; let rm;
  while ((rm = roleRe.exec(src)) !== null) { const end = matchingClose(src, rm.index, rm[1].toLowerCase()); if (end > rm.index) spans.push({ start: rm.index, end: end }); }
  let best = null, bestLen = 0;
  for (const s of spans) { const len = htmlToText(src.slice(s.start, s.end)).length; if (len > bestLen) { best = s; bestLen = len; } }
  if (best && bestLen >= 400) return src.slice(best.start, best.end);
  const body = src.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  return body ? body[1] : src;
}
function matchingClose(src, from, tag) {
  const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi'); re.lastIndex = from; let depth = 0, m;
  while ((m = re.exec(src)) !== null) { if (m[1]) { if (--depth === 0) return re.lastIndex; } else depth++; }
  return -1;
}

// Paragraph lines that read like content, not leftover menu items.
function contentLines(text) {
  return String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(function (l) {
    if (!l) return false;
    const words = l.split(/\s+/).length;
    if (words >= 8) return true;
    return words >= 4 && /[.!?:;"”)]$/.test(l);
  });
}
// Class/id-based removal can hit a content wrapper (e.g. class="page-with-sidebar"). If it removes most of the text,
// fall back to tag-based removal only (nav/header/footer/aside/form still dropped).
function mainContentText(html) {
  const region = mainRegion(html);
  const strict = contentLines(htmlToText(region)).join('\n');
  const loose = contentLines(htmlToText(region, { attrs: false })).join('\n');
  return strict.length >= loose.length * 0.4 ? strict : loose;
}

const STOP = new Set('the a an and or but of to in on at for from by with as is are was were be been being it its this that these those has have had not no do does did will would can could should may might than then there their they them he she his her we our you your i about into over after before more most such which who whom what when where why how all any each also only just very said says say according video claims claim'.split(' '));
function keywords(claim) {
  const words = String(claim || '').toLowerCase().replace(/[‘’]/g, "'").match(/[a-z0-9][a-z0-9'.-]*[a-z0-9]|[0-9]/g) || [];
  return [...new Set(words.filter(function (w) { return !STOP.has(w) && (w.length >= 4 || /\d/.test(w)); }))];
}

// Builds an excerpt of at most maxChars from the text's paragraphs: the opening paragraphs, then the paragraphs that share the
// most words with the claim, in page order. Every part is a verbatim slice of the text; gaps are marked with "[...]".
function buildExcerpt(text, claim, maxChars) {
  const limit = maxChars || 6000, gap = '\n[...]\n';
  const paras = String(text || '').split('\n').map(function (p) { return p.trim(); }).filter(Boolean);
  const whole = paras.join('\n');
  if (whole.length <= limit) return { excerpt: whole, selected: 'all', parts: paras.length };
  const kw = keywords(claim);
  const scored = paras.map(function (p, i) {
    const low = p.toLowerCase(); let hits = 0;
    for (const k of kw) if (low.includes(k)) hits += /\d/.test(k) ? 2 : 1;
    return { i: i, p: p, score: hits };
  });
  const chosen = new Set(); let used = 0;
  const add = function (i) { const p = paras[i]; const cost = p.length + (chosen.size ? gap.length : 0); if (used + cost > limit) return false; chosen.add(i); used += cost; return true; };
  // lead: up to ~1,200 characters of the opening
  for (let i = 0; i < paras.length && used < 1200; i++) if (!add(i)) break;
  scored.filter(function (s) { return s.score > 0 && !chosen.has(s.i); }).sort(function (a, b) { return b.score - a.score || a.i - b.i; })
    .forEach(function (s) { if (paras[s.i].length > limit) { /* oversize paragraph: skip */ } else add(s.i); });
  const idx = [...chosen].sort(function (a, b) { return a - b; });
  const parts = []; let prev = -2;
  for (const i of idx) { if (parts.length) parts.push(i === prev + 1 ? '\n' : gap); parts.push(paras[i]); prev = i; }
  let excerpt = parts.join('');
  if (!excerpt) excerpt = whole.slice(0, limit);
  return { excerpt: excerpt, selected: 'lead+claim-matched', parts: idx.length };
}

module.exports = { decodeEntities, htmlToText, mainRegion, mainContentText, contentLines, buildExcerpt, keywords };
