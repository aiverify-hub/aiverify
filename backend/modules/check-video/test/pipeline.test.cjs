'use strict';
// End-to-end pipeline with fake services: no network, no spending.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createCheckVideo, parseYouTubeUrl, _internal } = require('../pipeline.cjs');

const NASA = '<html><body><nav><p>Menu menu menu menu menu menu menu menu</p></nav><main>' + '<p>The Webb telescope is an infrared observatory built by NASA with ESA and CSA partners.</p>'.repeat(3)
  + '<p>Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.</p></main></body></html>';
const EXA_ONLY_TEXT = 'Snopes fact check.\nThe claim that Webb launched on Christmas Day 2021 is accurate; it lifted off on December 25, 2021 from Kourou.\n' + 'More background text about the launch and the observatory. '.repeat(10);

function fakeIo(opts) {
  const o = opts || {}, calls = { anthropic: [], exa: [], get: [] };
  return {
    calls,
    hasKeys: () => ({ anthropic: true, exa: o.exa !== false }),
    getTranscript: async () => o.transcript || { ok: true, title: 'Webb facts', source: 'fake captions', text: 'Hi everyone. The James Webb telescope went up on Christmas Day 2021, which is amazing. Also the moon is made of cheese, folks.' },
    publicGet: async (url, opt) => {
      calls.get.push({ url, opt });
      if (/science\.nasa\.gov/.test(url)) return { ok: true, status: 200, html: NASA, text: NASA, content_type: 'text/html', url };
      if (/britannica\.com/.test(url)) return { ok: false, status: 403, error: '', content_type: 'text/html' };
      if (/snopes\.com/.test(url)) return { ok: false, status: 0, error: 'timeout' };
      return { ok: false, status: 404, error: '' };
    },
    exa: async (p, body) => {
      calls.exa.push(body);
      return { status: 200, body: JSON.stringify({ costDollars: { total: 0.015 }, results: [
        { url: 'https://snopes.news/webb-hoax', title: 'lookalike', text: 'Webb never launched. '.repeat(30) },
        { url: 'https://www.britannica.com/topic/webb', title: 'Britannica', text: 'Webb launched December 25, 2021. '.repeat(20) },
        { url: 'https://www.snopes.com/fact-check/webb', title: 'Snopes', text: EXA_ONLY_TEXT },
        { url: 'https://science.nasa.gov/mission/webb/', title: 'NASA Webb', text: 'provider copy of NASA page '.repeat(30) },
        { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'the video', text: 'x '.repeat(400) }
      ] }) };
    },
    anthropic: async (p, body) => {
      calls.anthropic.push({ p, body });
      if (p === '/v1/messages/count_tokens') return { status: 200, body: JSON.stringify({ input_tokens: 1200 }) };
      const content = body.messages[0].content, usage = { input_tokens: 1200, output_tokens: 90 };
      if (/list the factual claims/.test(content)) return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: JSON.stringify({ video_kind: 'factual', note: '', claims: [
        { claim: 'NASA\'s James Webb Space Telescope launched on December 25, 2021.', video_quote: 'The James Webb telescope went up on Christmas Day 2021', search_query: 'Webb launch date' },
        { claim: 'The Moon is made of cheese.', video_quote: 'the moon is made of cheese', search_query: 'moon composition' }] }) }] }) };
      const judged = o.judge ? o.judge(content) : null;
      if (judged) return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: JSON.stringify(judged) }] }) };
      return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: JSON.stringify({ verdict: 'insufficient', quote: '', source: null, reason: 'Not settled.' }) }] }) };
    }
  };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cv-test-'));

test('YouTube links: watch, short, youtu.be accepted; others refused', () => {
  assert.equal(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=3').videoId, 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ').url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(parseYouTubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x').videoId, 'dQw4w9WgXcQ');
  for (const bad of ['https://www.youtube.com/playlist?list=x', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', 'https://youtu.be/short']) assert.equal(parseYouTubeUrl(bad), null, bad);
});

test('full run: packet rules, judge prompt roles, quote binding, private excerpts', async () => {
  const io = fakeIo({ judge: c => /Webb Space Telescope launched/.test(c) ? { verdict: 'supported', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'NASA states the date.' } : null });
  const cv = createCheckVideo({ io, runsDir: tmp() });
  const r = await cv.run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.claims.length, 2);
  const [c1, c2] = r.claims;
  assert.equal(c1.central, true); assert.equal(c1.verdict, 'supported');
  assert.equal(c1.quote.publisher, 'nasa.gov'); assert.equal(c1.quote.role, 'primary/official');
  assert.equal(c1.videoQuote, 'The James Webb telescope went up on Christmas Day 2021');
  assert.equal(c2.verdict, 'insufficient'); assert.equal(c2.label, "Can't determine");
  // packet rules
  const used = c1.sources.map(s => s.url);
  assert.equal(used[0], 'https://science.nasa.gov/mission/webb/', 'primary source first, direct text');
  assert.equal(c1.sources[0].origin, 'direct');
  assert.ok(!used.some(u => /snopes\.news/.test(u)), 'lookalike excluded');
  assert.ok(!used.some(u => /britannica/.test(u)), 'publisher refused (403): provider copy not used');
  assert.ok(!used.some(u => /youtube/.test(u)), 'the video itself excluded');
  assert.equal(c1.sources.find(s => /snopes\.com/.test(s.url)).origin, 'search-provider', 'direct failed (not refused): provider text used');
  // judge prompt carries publisher roles and the independence rule
  const judgeBody = io.calls.anthropic.find(x => x.p === '/v1/messages' && /assess one claim/.test(x.body.messages[0].content)).body;
  assert.match(judgeBody.messages[0].content, /Publisher: nasa\.gov \| Role: primary\/official/);
  assert.match(judgeBody.messages[0].content, /same publisher count as ONE source/);
  assert.deepEqual(judgeBody.thinking, { type: 'between_tools' }); assert.equal(judgeBody.max_tokens, 600); assert.equal(judgeBody.model, 'claude-sonnet-5-5');
  // evidence fetches use bounded truncation
  assert.ok(io.calls.get.every(g => g.opt.allowTruncate === true && g.opt.limit === 1500000));
  // the visitor's result carries no excerpt text; the private record does
  const pub = JSON.stringify(r);
  assert.ok(!pub.includes('Snopes fact check.') && !pub.includes('excerpt"'), 'no excerpts in public result');
  assert.equal(r.privateEvidence, undefined);
  const saved = JSON.parse(fs.readFileSync(path.join(cv.runsDir, 'run-' + r.runId + '.json'), 'utf8'));
  assert.ok(saved.privateEvidence[0].sources[0].excerpt.length > 0);
  assert.match(r.limits, /not the whole video/);
  assert.ok(r.cost.usd > 0 && r.cost.usd < 0.6);
});

test('a firm verdict whose quote is not in the cited excerpt is withheld as can\'t determine', async () => {
  const io = fakeIo({ judge: c => /Webb Space Telescope launched/.test(c) ? { verdict: 'supported', quote: 'Webb launched on December 25, 2021.', source: 1, reason: 'x' } : null });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.claims[0].verdict, 'insufficient'); assert.equal(r.claims[0].modelVerdict, 'supported');
  assert.match(r.claims[0].notes.join(' '), /NOT_IN_CITED_EXCERPT/);
});

test('support that comes only from the claim\'s originator is withheld', async () => {
  const io = fakeIo({ judge: () => ({ verdict: 'supported', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'x' }) });
  io.exa = async () => ({ status: 200, body: JSON.stringify({ results: [{ url: 'https://babylonbee.com/news/webb', title: 'Bee', text: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.\n' + 'Satire text. '.repeat(40) }] }) });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.claims[0].sources[0].role, 'originator of the claim');
  assert.equal(r.claims[0].verdict, 'insufficient');
});

test('captions unavailable gives an honest message and spends nothing', async () => {
  const io = fakeIo({ transcript: { ok: false, error: 'no captions' } });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.ok, false); assert.equal(r.stage, 'captions'); assert.equal(io.calls.anthropic.length, 0);
});

test('spending caps stop the run before overspending', async () => {
  const io = fakeIo();
  const r = await createCheckVideo({ io, runsDir: tmp(), config: { perRunUsdCap: 0.01 } }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.ok, false); assert.equal(r.stage, 'budget');
  const dir = tmp(); fs.writeFileSync(path.join(dir, 'spend-' + new Date().toISOString().slice(0, 10) + '.json'), JSON.stringify({ usd: 4.999 }));
  const r2 = await createCheckVideo({ io: fakeIo(), runsDir: dir }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r2.stage, 'budget'); assert.match(r2.error, /Daily/);
});

test('review answers are saved per run and validated', async () => {
  const cv = createCheckVideo({ io: fakeIo(), runsDir: tmp() });
  const r = await cv.run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(cv.saveReview(r.runId, { answer: 'partly', note: 'claim 2 missed' }), true);
  assert.equal(cv.saveReview(r.runId, { answer: 'maybe' }), false);
  assert.equal(cv.saveReview('../x', { answer: 'right' }), false);
  assert.equal(cv.listRuns()[0].review.answer, 'partly');
});

// Fake claim step with caption-quality fields; claim 1 optionally depends on a guessed caption word.
function withQuality(io, quality, guess) {
  const orig = io.anthropic;
  io.anthropic = async (p, body, h) => {
    if (p === '/v1/messages' && /list the factual claims/.test(body.messages[0].content)) return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 90 }, content: [{ type: 'text', text: JSON.stringify({ video_kind: 'factual', caption_quality: quality, garbled_passages: 2, note: '', claims: [
      { claim: 'NASA\'s James Webb Space Telescope launched on December 25, 2021.', video_quote: 'went up on Christmas Day 2021', search_query: 'Webb launch', depends_on_guess: guess }] }) }] }) };
    return orig(p, body, h);
  };
  return io;
}
const SUPPORT = c => /Webb Space Telescope launched/.test(c) ? { verdict: 'supported', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'NASA.' } : null;

test('caption type, length and words per minute are recorded; good captions keep firm answers', async () => {
  const io = withQuality(fakeIo({ judge: SUPPORT, transcript: { ok: true, title: 'T', source: 'fake', captionKind: 'automatic', durationSec: 10, text: 'The James Webb telescope went up on Christmas Day 2021 which is amazing everyone.' } }), 'good', false);
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.video.captionKind, 'automatic'); assert.equal(r.video.captionQuality, 'good');
  assert.equal(r.video.wordsPerMinute, null, 'too short to measure');
  assert.equal(r.reliability.flagged, false); assert.equal(r.claims[0].verdict, 'supported');
});

test('poor captions or missing speech flag the video; firm answers are withheld but recorded', async () => {
  const io = withQuality(fakeIo({ judge: SUPPORT }), 'poor', false);
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.reliability.flagged, true); assert.match(r.reliability.reasons[0], /garbled/);
  assert.equal(r.claims[0].verdict, 'insufficient'); assert.equal(r.claims[0].wouldHaveBeen, 'supported'); assert.equal(r.claims[0].quote, null);
  assert.match(r.claims[0].label, /not enough reliable caption data/);
  // 20 words over 10 minutes = 2 words a minute
  const io2 = withQuality(fakeIo({ judge: SUPPORT, transcript: { ok: true, title: 'T', source: 'fake', captionKind: 'automatic', durationSec: 600, text: 'The James Webb telescope went up on Christmas Day 2021 which is amazing everyone and more words here ok.' } }), 'good', false);
  const r2 = await createCheckVideo({ io: io2, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r2.video.wordsPerMinute, 2); assert.equal(r2.reliability.flagged, true); assert.match(r2.reliability.reasons[0], /words a minute/);
});

test('a claim that depends on a guessed name or number is withheld as caption unclear', async () => {
  const io = withQuality(fakeIo({ judge: SUPPORT }), 'fair', true);
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.reliability.flagged, false);
  assert.equal(r.claims[0].verdict, 'insufficient'); assert.equal(r.claims[0].label, "Can't determine (caption unclear)"); assert.equal(r.claims[0].wouldHaveBeen, 'supported');
});

test('judge format is enforced; prose around the JSON and inner quotes are handled; raw text stays private', async () => {
  const io = fakeIo(); const orig = io.anthropic; let judgeBody = null;
  io.anthropic = async (p, body, h) => {
    if (p === '/v1/messages' && /assess one claim/.test(body.messages[0].content) && /Webb Space Telescope launched/.test(body.messages[0].content)) {
      judgeBody = body;
      const text = 'Here is my answer: ' + JSON.stringify({ verdict: 'supported', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'NASA says "launched" {plainly}.' }) + ' Thanks {end}';
      return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 80 }, content: [{ type: 'text', text }] }) };
    }
    return orig(p, body, h);
  };
  const cv = createCheckVideo({ io, runsDir: tmp() });
  const r = await cv.run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(judgeBody.output_config.format.type, 'json_schema');
  assert.equal(r.claims[0].verdict, 'supported');
  assert.ok(!JSON.stringify(r).includes('Here is my answer'), 'raw judge text not in the visitor result');
  const saved = JSON.parse(fs.readFileSync(path.join(cv.runsDir, 'run-' + r.runId + '.json'), 'utf8'));
  assert.match(saved.privateEvidence.find(x => x.n === 1).rawJudgeText, /Here is my answer/);
});

test('source 0 means no source; an insufficient answer with source 0 is read correctly', async () => {
  const io = fakeIo({ judge: () => ({ verdict: 'insufficient', quote: '', source: 0, reason: 'Not settled.' }) });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.claims[0].verdict, 'insufficient'); assert.equal(r.claims[0].reason, 'Not settled.');
});

test('caution line appears only when a claim is contradicted', async () => {
  const contra = fakeIo({ judge: c => /Webb Space Telescope launched/.test(c) ? { verdict: 'contradicted', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'Date differs.' } : null });
  const r = await createCheckVideo({ io: contra, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.match(r.caution, /^Caution: at least one claim/);
  const r2 = await createCheckVideo({ io: fakeIo({ judge: SUPPORT }), runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r2.caution, undefined);
});

test('source suggestions are saved with the publisher; bad addresses are refused', () => {
  const cv = createCheckVideo({ io: fakeIo(), runsDir: tmp() });
  assert.equal(cv.saveSourceSuggestion({ url: 'https://www.cdc.gov/vaccines/', note: 'official data' }), true);
  for (const bad of ['', 'cdc.gov', 'javascript:alert(1)', 'ftp://x.org/a', 'https://' + 'a'.repeat(600) + '.com']) assert.equal(cv.saveSourceSuggestion({ url: bad }), false, bad);
  const line = JSON.parse(fs.readFileSync(path.join(cv.runsDir, 'source-suggestions.jsonl'), 'utf8').trim());
  assert.equal(line.publisher, 'cdc.gov'); assert.equal(line.note, 'official data');
});

test('the refusal-fallback option is dropped once if the API rejects it', async () => {
  _internal.FALLBACK_STATE.enabled = true;
  const io = fakeIo(); const orig = io.anthropic; let rejected = 0;
  io.anthropic = async (p, body, h) => { if (p === '/v1/messages' && body.fallbacks) { rejected++; return { status: 400, body: JSON.stringify({ error: { message: 'fallbacks not supported here' } }) }; } return orig(p, body, h); };
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.ok, true); assert.equal(rejected, 1); assert.equal(_internal.FALLBACK_STATE.enabled, false);
  _internal.FALLBACK_STATE.enabled = true;
});
