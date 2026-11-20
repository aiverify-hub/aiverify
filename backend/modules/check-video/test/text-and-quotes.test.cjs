'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { decodeEntities, htmlToText, mainContentText, buildExcerpt } = require('../html-text.cjs');
const { bindQuote } = require('../quote-match.cjs');

test('entities are decoded once, after tags are removed', () => {
  assert.equal(decodeEntities('it&#39;s &amp;lt; &#x2019; &rsquo; &quot;x&quot; &amp; &bogus; &#0; &#xD800;'), 'it\'s &lt; ’ ’ "x" & &bogus; &#0; &#xD800;');
  assert.equal(htmlToText('<p>&lt;b&gt;bold&lt;/b&gt;</p>'), '<b>bold</b>');
  assert.equal(htmlToText('<p>Webb&nbsp;launched on Dec. 25, 2021 &mdash; NASA&rsquo;s</p>'), 'Webb launched on Dec. 25, 2021 — NASA’s');
});

const NAV = '<nav><ul>' + Array.from({ length: 300 }, (_, i) => '<li><a href="/x' + i + '">Menu item number ' + i + ' about space</a></li>').join('') + '</ul></nav>';
const PAGE = '<html><head><title>T</title><style>p{}</style><script>var a="<p>no</p>";</script></head><body>'
  + '<header class="site-header"><p>Official websites use .gov. A .gov website belongs to an official government organization.</p></header>' + NAV
  + '<div class="page-with-sidebar"><main id="main"><h1>Webb launch</h1>'
  + '<p>The James Webb Space Telescope is the largest space science telescope ever built by NASA and its partners.</p>'
  + Array.from({ length: 40 }, (_, i) => '<p>Background paragraph ' + i + ' describing mirrors, instruments and the long engineering history of the observatory in detail.</p>').join('')
  + '<p>Webb launched on Dec. 25th 2021 from Europe&#8217;s Spaceport in Kourou, French Guiana.</p>'
  + '<div class="share-buttons"><p>Share this page on social media with your friends today.</p></div></main>'
  + '<aside><p>Related: other missions you may like to read about today.</p></aside></div>'
  + '<footer><p>NASA Privacy policy and accessibility statement for this website.</p></footer></body></html>';

test('main content excludes scripts, navigation, header, footer, aside and share widgets', () => {
  const t = mainContentText(PAGE);
  assert.ok(t.startsWith('Webb launch') || t.startsWith('The James Webb'), 'starts at the article');
  assert.ok(t.includes('Webb launched on Dec. 25th 2021 from Europe’s Spaceport'));
  for (const bad of ['Menu item number', 'Official websites use', 'Share this page', 'Related: other missions', 'Privacy policy', 'var a=']) assert.ok(!t.includes(bad), bad);
});

test('a content wrapper with a chrome-like class name does not wipe out the content', () => {
  const html = '<body><div class="layout-with-sidebar">' + Array.from({ length: 10 }, (_, i) => '<p>Real article sentence number ' + i + ' with enough words to count as content.</p>').join('') + '</div><nav><p>Home About Contact us page links here.</p></nav></body>';
  const t = mainContentText(html);
  assert.ok(t.includes('Real article sentence number 9'));
  assert.ok(!t.includes('Home About Contact'));
});

test('excerpt keeps the opening and the claim-matching paragraph from deep in a long page, verbatim', () => {
  const t = mainContentText(PAGE);
  const ex = buildExcerpt(t + '\n' + Array.from({ length: 80 }, (_, i) => 'Later filler paragraph ' + i + ' with words about telescopes and cameras and other topics entirely.').join('\n'), 'NASA\'s James Webb Space Telescope launched on December 25, 2021 from Kourou.', 6000);
  assert.ok(ex.excerpt.length <= 6000);
  assert.ok(ex.excerpt.includes('Webb launched on Dec. 25th 2021 from Europe’s Spaceport in Kourou, French Guiana.'));
  assert.ok(ex.excerpt.includes('The James Webb Space Telescope is the largest'));
  assert.equal(bindQuote('Webb launched on Dec. 25th 2021 from Europe\'s Spaceport in Kourou, French Guiana.', ex.excerpt).bound, true);
});

// Quote binding: T564 frozen cases (positives and negatives) plus the exact-first ambiguity rule.
const EX = 'NASA said Webb launched on Dec. 25, 2021. It’s the largest telescope. The mission was not delayed in 2022.';
test('T564 rule: typography-equivalent and exact quotes bind; altered quotes do not', () => {
  assert.equal(bindQuote('Webb launched on Dec. 25, 2021.', EX).matchType, 'EXACT');
  const t = bindQuote("It's the largest telescope.", EX);
  assert.equal(t.bound, true); assert.equal(t.matchType, 'TYPOGRAPHY_EQUIVALENT'); assert.equal(t.originalSubstring, 'It’s the largest telescope.');
  assert.equal(bindQuote('Webb   launched\non Dec. 25, 2021.', EX).bound, true, 'whitespace runs equal');
  for (const q of ['Webb launched on Dec. 24, 2021.', 'Hubble launched on Dec. 25, 2021.', 'The mission was delayed in 2022.', 'The mission was not delayed in 2023.',
    'NASA said Webb launched in 2021.', 'webb launched on Dec. 25, 2021.', 'It’s the largest  telescope ever.', 'Webb launched on Dec. 25 - 2021.', '', 'NASA said Webb launched on Dec. 25, 2021. The mission'])
    assert.equal(bindQuote(q, EX).bound, false, JSON.stringify(q));
  assert.equal(bindQuote('Webb launched on Dec. 25, 2021.', 'Other source text only.').reason, 'NOT_IN_CITED_EXCERPT');
});

test('exact-first: a loose double match binds only when exactly one occurrence matches exactly', () => {
  const mixed = 'Caption: It\'s a mosaic of images. Later: It’s a mosaic of images.';
  const a = bindQuote("It's a mosaic of images.", mixed);
  assert.equal(a.bound, true); assert.equal(a.resolvedBy, 'EXACT_FIRST'); assert.equal(a.start, mixed.indexOf("It's"));
  const b = bindQuote('It’s a mosaic of images.', mixed);
  assert.equal(b.bound, true); assert.equal(b.start, mixed.indexOf('It’s'));
  const same = 'It\'s a mosaic. And again: It\'s a mosaic.';
  assert.equal(bindQuote("It's a mosaic.", same).reason, 'AMBIGUOUS_MULTIPLE_MATCHES');
  const curlyBoth = 'It’s a mosaic. And again: It’s a mosaic.';
  assert.equal(bindQuote("It's a mosaic.", curlyBoth).reason, 'AMBIGUOUS_MULTIPLE_MATCHES', 'no exact occurrence: stays blocked');
});
