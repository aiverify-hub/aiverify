'use strict';
// End-to-end pipeline with fake services: no network, no spending.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const P0 = require('../pipeline.cjs'), { parseYouTubeUrl, _internal } = P0;
// Older tests exercise web-checked verdicts and unrated verses; v10 turns those off by default, so they switch them on here.
const createCheckVideo = o => P0.createCheckVideo(Object.assign({}, o, { config: Object.assign({ factsFirm: true, rateVerses: false }, o && o.config) }));

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
        { claim: 'NASA\'s James Webb Space Telescope launched on December 25, 2021.', video_quote: 'The James Webb telescope went up on Christmas Day 2021', search_query: 'Webb launch date', corrections: [] },
        { claim: 'The Moon is made of cheese.', video_quote: 'the moon is made of cheese', search_query: 'moon composition', corrections: [] }] }) }] }) };
      // v5 claim rewrite: unreadable by default (the original claim is kept); tests of the rewrite set o.repair.
      if (/You fix ONE claim/.test(content)) return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: JSON.stringify(o.repair ? o.repair(content) : { none: true }) }] }) };
      // v3 second check of "shown false" findings: confirms by default; tests of the check set o.verify.
      if (/double-check a "shown false" finding/.test(content)) return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: JSON.stringify(o.verify ? o.verify(content) : { problem: 'none', confirmed: true, video_words: 'The James Webb telescope went up on Christmas Day 2021', part_adds_detail: false, reason: 'The excerpt proves it.' }) }] }) };
      // v4 detail check of "backed" findings: confirms by default; tests of the check set o.detail.
      if (/double-check a "backed" finding/.test(content)) return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: JSON.stringify(o.detail ? o.detail(content) : { details: [{ detail: 'the claim', status: 'stated', source: 1 }], reason: 'Every detail is stated.' }) }] }) };
      const judged = o.judge ? o.judge(content) : null; if (judged && !judged.video_says) judged.video_says = 'yes';
      // v2: a judge that omits parts gets the consistent default (one part with the verdict's status); tests of the parts rule set their own.
      if (judged && !('parts' in judged)) judged.parts = [{ part: 'the claim', status: { supported: 'backed', contradicted: 'shown_false', misleading: 'shown_false' }[judged.verdict] || 'not_established' }];
      if (judged && judged.parts === undefined) delete judged.parts;
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
  assert.equal(c2.verdict, 'insufficient'); assert.equal(c2.label, 'Not established from the sources checked');
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
  assert.deepEqual(judgeBody.thinking, { type: 'between_tools' }); assert.equal(judgeBody.max_tokens, 1000); assert.equal(judgeBody.model, 'claude-sonnet-5-5');
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
  const dir = tmp(); fs.writeFileSync(path.join(dir, 'spend-' + _internal.budgetDay() + '.json'), JSON.stringify({ usd: 4.999 }));
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
      { claim: 'NASA\'s James Webb Space Telescope launched on December 25, 2021.', video_quote: 'went up on Christmas Day 2021', search_query: 'Webb launch', depends_on_guess: guess, corrections: [] }] }) }] }) };
    return orig(p, body, h);
  };
  return io;
}
const SUPPORT = c => /Webb Space Telescope launched/.test(c) ? { verdict: 'supported', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'NASA.' } : null;

test('caption type, length and words per minute are recorded; good captions keep firm answers', async () => {
  const io = withQuality(fakeIo({ judge: SUPPORT, transcript: { ok: true, title: 'T', source: 'fake', captionKind: 'automatic', durationSec: 10, text: 'The James Webb telescope went up on Christmas Day 2021 which is amazing everyone.' } }), 'good', false);
  const r = await createCheckVideo({ io, runsDir: tmp(), config: { minVideoSec: 0 } }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
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

test('guessed caption word: every firm answer is held back as caption unclear', async () => {
  const io = withQuality(fakeIo({ judge: SUPPORT }), 'fair', true);
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.reliability.flagged, false);
  assert.equal(r.claims[0].verdict, 'insufficient', 'a guessed caption word withholds support too (Fred re-check 3)'); assert.equal(r.claims[0].wouldHaveBeen, 'supported');
  const CONTRA = c => /Webb Space Telescope launched/.test(c) ? { verdict: 'contradicted', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'x' } : null;
  const r2 = await createCheckVideo({ io: withQuality(fakeIo({ judge: CONTRA }), 'fair', true), runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r2.claims[0].verdict, 'insufficient'); assert.equal(r2.claims[0].label, "Not established (caption unclear)"); assert.equal(r2.claims[0].wouldHaveBeen, 'contradicted');
});

test('a contradiction resting on an "other" source is held back; an official source is enough', async () => {
  const io = fakeIo({ judge: c => /Webb Space Telescope launched/.test(c) ? { verdict: 'contradicted', quote: 'The claim that Webb launched on Christmas Day 2021 is accurate; it lifted off on December 25, 2021 from Kourou.', source: 2, reason: 'x' } : null });
  io.exa = async () => ({ status: 200, body: JSON.stringify({ results: [
    { url: 'https://science.nasa.gov/mission/webb/', title: 'NASA', text: 'x' },
    { url: 'https://someblog.example/webb', title: 'Blog', text: EXA_ONLY_TEXT }] }) });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.claims[0].sources[1].role, 'other');
  assert.equal(r.claims[0].verdict, 'insufficient'); assert.match(r.claims[0].notes.join(' '), /contradiction needs an official/);
});

test('videos whose captions cannot be read are recorded for coverage counts', async () => {
  const cv = createCheckVideo({ io: fakeIo({ transcript: { ok: false, error: 'no captions' } }), runsDir: tmp() });
  const r = await cv.run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.stage, 'captions');
  assert.ok(fs.existsSync(path.join(cv.runsDir, 'run-' + r.runId + '.json')));
});

test('judge format is enforced; prose around the JSON and inner quotes are handled; raw text stays private', async () => {
  const io = fakeIo(); const orig = io.anthropic; let judgeBody = null;
  io.anthropic = async (p, body, h) => {
    if (p === '/v1/messages' && /assess one claim/.test(body.messages[0].content) && /Webb Space Telescope launched/.test(body.messages[0].content)) {
      judgeBody = body;
      const text = 'Here is my answer: ' + JSON.stringify({ video_says: 'yes', parts: [{ part: 'launch date', status: 'backed' }], verdict: 'supported', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'NASA says "launched" {plainly}.' }) + ' Thanks {end}';
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
  assert.match(r.caution, /^Caution: the evidence shows at least one claim/);
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

// ---------- Fred pre-release review fixes ----------
const today = () => _internal.budgetDay();
test('Fred #2: a corrupt or unwritable spending ledger stops the check (fails closed)', async () => {
  const dir = tmp(); fs.writeFileSync(path.join(dir, 'spend-' + today() + '.json'), '{not json');
  const io = fakeIo(); const r = await createCheckVideo({ io, runsDir: dir }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.stage, 'budget'); assert.match(r.error, /ledger/); assert.equal(io.calls.anthropic.length, 0);
  const notADir = path.join(tmp(), 'file'); fs.writeFileSync(notADir, 'x');
  const io2 = fakeIo(); const r2 = await createCheckVideo({ io: io2, runsDir: notADir }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r2.stage, 'budget'); assert.equal(io2.calls.anthropic.length, 0);
});

test('Fred #2: each reservation is settled against its own day', () => {
  const dir = tmp(); const b = _internal.createBudget({ perRunUsdCap: 1, dailyUsdCap: 5, runDeadlineMs: 1e9 }, dir)();
  const e = b.reserve(0.5, 'x'); e.day = '2000-01-01'; fs.writeFileSync(path.join(dir, 'spend-2000-01-01.json'), JSON.stringify({ usd: 0.5 }));
  b.settle(e, 0.1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'spend-2000-01-01.json'), 'utf8')).usd, 0.1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'spend-' + today() + '.json'), 'utf8')).usd, 0.5, 'today is not adjusted by an old reservation');
});

test('Fred #3: with the caps exhausted the caption service is never called', async () => {
  let captionCalls = 0; const io = fakeIo(); const orig = io.getTranscript; io.getTranscript = async (...a) => { captionCalls++; return orig(...a); };
  const r = await createCheckVideo({ io, runsDir: tmp(), config: { dailyUsdCap: 0, perRunUsdCap: 0 } }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.stage, 'budget'); assert.equal(captionCalls, 0);
  const r2 = await createCheckVideo({ io: fakeIo(), runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.ok(r2.cost.ledger.some(x => /captions/.test(x.what)), 'caption call counted in the ledger');
});

test('Fred #4: a stop in one claim prevents new paid calls in the other; cost is final', async () => {
  const io = fakeIo({ judge: SUPPORT });
  io.exa = async (p, body) => {
    if (/moon/i.test(body.query)) return { status: 401, body: '{}' };                 // claim 2: key refused at once
    await new Promise(r => setTimeout(r, 60));                                         // claim 1: still searching
    return { status: 200, body: JSON.stringify({ results: [{ url: 'https://science.nasa.gov/mission/webb/', title: 'NASA', text: '' }] }) };
  };
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.stage, 'provider'); assert.match(r.stoppedEarly, /Exa key was refused/);
  assert.equal(io.calls.anthropic.filter(x => x.p === '/v1/messages' && /assess one claim/.test(x.body.messages[0].content)).length, 0, 'no judgment started after the stop');
  assert.ok(r.claims.every(c => c.verdict === 'insufficient'));
});

test('Fred #4: closing the page stops the check before further paid calls', async () => {
  const io = fakeIo({ judge: SUPPORT }); let closed = false;
  const orig = io.getTranscript; io.getTranscript = async (...a) => { const t = await orig(...a); closed = true; return t; };
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' }, { shouldStop: () => closed });
  assert.equal(r.stage, 'stopped'); assert.equal(io.calls.anthropic.filter(x => x.p === '/v1/messages').length, 0);
});

test('Fred #5: a redirect is classified by where it lands, so it cannot borrow an official label', async () => {
  const io = fakeIo({ judge: c => /Webb Space Telescope launched/.test(c) ? { verdict: 'contradicted', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'x' } : null });
  io.exa = async () => ({ status: 200, body: JSON.stringify({ results: [{ url: 'https://www.agency.gov/webb', title: 'Agency', text: '' }] }) });
  io.publicGet = async () => ({ ok: true, status: 200, html: NASA, text: NASA, content_type: 'text/html', url: 'https://untrusted.example/page' });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  const s = r.claims[0].sources[0];
  assert.equal(s.url, 'https://untrusted.example/page'); assert.equal(s.publisher, 'untrusted.example'); assert.equal(s.role, 'other');
  assert.equal(r.claims[0].verdict, 'insufficient', 'contradiction from the redirect target is held back');
});

test('Fred #6: a claim whose passage is not in the captions gets no firm answer', async () => {
  const io = withQuality(fakeIo({ judge: SUPPORT }), 'good', false);
  const orig = io.anthropic;
  io.anthropic = async (p, body, h) => {
    const res = await orig(p, body, h);
    if (p === '/v1/messages' && /list the factual claims/.test(body.messages[0].content)) { const j = JSON.parse(res.body); const t = JSON.parse(j.content[0].text); t.claims[0].video_quote = 'words the video never said'; j.content[0].text = JSON.stringify(t); res.body = JSON.stringify(j); }
    return res;
  };
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.claims[0].captionBound, false);
  assert.equal(r.claims[0].verdict, 'insufficient'); assert.equal(r.claims[0].label, "Not established (not found in the captions)"); assert.equal(r.claims[0].wouldHaveBeen, 'supported');
});

// ---------- Fred re-check fixes ----------
test('Fred re-check #4: a stop during the first response prevents the no-fallback retry from being sent', async () => {
  _internal.FALLBACK_STATE.enabled = true;
  let closed = false, messages = 0; const io = fakeIo(); const orig = io.anthropic;
  io.anthropic = async (p, body, h) => {
    if (p === '/v1/messages') { messages++; if (body.fallbacks) { closed = true; return { status: 400, body: JSON.stringify({ error: { message: 'no fallbacks' } }) }; } }
    return orig(p, body, h);
  };
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' }, { shouldStop: () => closed });
  assert.equal(messages, 1, 'retry not dispatched after the stop'); assert.equal(r.stage, 'stopped');
  _internal.FALLBACK_STATE.enabled = true;
});

test('Fred re-check #4: an unexpected error stops scheduling and waits for every worker before rethrowing', async () => {
  const started = [], done = [];
  await assert.rejects(_internal.mapLimit([1, 2, 3, 4], 2, async x => {
    started.push(x);
    if (x === 1) throw new Error('boom');
    await new Promise(r => setTimeout(r, 30)); done.push(x); return x;
  }), /boom/);
  assert.deepEqual(started.sort(), [1, 2], 'no new item scheduled after the failure');
  assert.deepEqual(done, [2], 'the running worker finished before the error was rethrown');
});

test('Fred re-check #6: a number the captions do not say withholds the firm answer', async () => {
  const io = fakeIo({ judge: () => ({ verdict: 'supported', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'x' }),
    transcript: { ok: true, title: 'T', source: 'fake', text: 'In our study we tested twenty people over a month and the results were clear to everyone involved.' } });
  const orig = io.anthropic;
  io.anthropic = async (p, body, h) => {
    if (p === '/v1/messages' && /list the factual claims/.test(body.messages[0].content)) return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 60 }, content: [{ type: 'text', text: JSON.stringify({ video_kind: 'factual', caption_quality: 'good', garbled_passages: 0, note: '', claims: [{ claim: 'The study tested 200 people.', video_quote: 'we tested', search_query: 'study', depends_on_guess: false, corrections: [] }] }) }] }) };
    return orig(p, body, h);
  };
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.deepEqual(r.claims[0].missingNumbers, [200]);
  assert.equal(r.claims[0].verdict, 'insufficient'); assert.equal(r.claims[0].label, "Not established (numbers differ from the captions)");
});

test('Fred re-check #2: a held ledger lock refuses (fails closed), however old it is', () => {
  const dir = tmp(); fs.writeFileSync(path.join(dir, 'spend.lock'), 'held');
  const b = _internal.createBudget({ perRunUsdCap: 1, dailyUsdCap: 5, runDeadlineMs: 1e9 }, dir)();
  assert.throws(() => b.reserve(0.1, 'x'), /busy/);
  const dir2 = tmp(), lock = path.join(dir2, 'spend.lock'); fs.writeFileSync(lock, 'old'); const old = new Date(Date.now() - 60000); fs.utimesSync(lock, old, old);
  const b2 = _internal.createBudget({ perRunUsdCap: 1, dailyUsdCap: 5, runDeadlineMs: 1e9 }, dir2)();
  assert.throws(() => b2.reserve(0.1, 'x'), /busy/); assert.equal(fs.readFileSync(lock, 'utf8'), 'old', 'a lock owned by another process is never removed');
});

test('Fred re-check #2: if a final cost cannot be saved, the reservation is kept and further paid work stops', () => {
  const dir = tmp(); const b = _internal.createBudget({ perRunUsdCap: 1, dailyUsdCap: 5, runDeadlineMs: 1e9 }, dir)();
  const e = b.reserve(0.2, 'x');
  fs.writeFileSync(path.join(dir, 'spend-' + today() + '.json'), '{corrupt');
  b.settle(e, 0.05);
  assert.equal(e.uncertain, true); assert.equal(b.total(), 0.2, 'reservation kept');
  assert.throws(() => b.checkOpen(), /cost could not be recorded/);
});

test('the refusal-fallback option is dropped once if the API rejects it', async () => {
  _internal.FALLBACK_STATE.enabled = true;
  const io = fakeIo(); const orig = io.anthropic; let rejected = 0;
  io.anthropic = async (p, body, h) => { if (p === '/v1/messages' && body.fallbacks) { rejected++; return { status: 400, body: JSON.stringify({ error: { message: 'fallbacks not supported here' } }) }; } return orig(p, body, h); };
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.ok, true); assert.equal(rejected, 1); assert.equal(_internal.FALLBACK_STATE.enabled, false);
  _internal.FALLBACK_STATE.enabled = true;
});

test('Fred re-check 2 #2: an unrecorded cost blocks every later check until reconciled', async () => {
  const dir = tmp(); const b = _internal.createBudget({ perRunUsdCap: 1, dailyUsdCap: 5, runDeadlineMs: 1e9 }, dir)();
  const e = b.reserve(0.2, 'x'); fs.writeFileSync(path.join(dir, 'spend-' + today() + '.json'), '{corrupt'); b.settle(e, 0.05);
  assert.ok(fs.existsSync(path.join(dir, 'spend-UNRESOLVED.json')));
  fs.writeFileSync(path.join(dir, 'spend-' + today() + '.json'), JSON.stringify({ usd: 0.2 })); // ledger repaired, but not reconciled
  const io = fakeIo(); const r = await createCheckVideo({ io, runsDir: dir }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.stage, 'budget'); assert.match(r.error, /reconcile/); assert.equal(io.calls.anthropic.length, 0);
});

test('Fred re-check 2 #6: no blanket year exemption ("2000 people" vs "twenty")', () => {
  const T = 'in our study we tested twenty people over a month';
  assert.deepEqual(_internal.claimNumbersMissing('The study tested 2000 people.', T, 'we tested'), [2000]);
  assert.deepEqual(_internal.claimNumbersMissing('As of May 2024, the study tested 20 people.', T, 'we tested'), [], 'publish-date prefix and month-year dates are exempt');
  assert.deepEqual(_internal.claimNumbersMissing('On December 25, 2021 the study tested 20 people.', T, 'we tested'), []);
});

test('Fred re-check 2 #6: the judge must find the claim in the caption passage, or no firm answer', async () => {
  const io = fakeIo({ judge: c => /Webb Space Telescope launched/.test(c) ? { video_says: 'no', verdict: 'supported', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'x' } : null });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.claims[0].verdict, 'insufficient'); assert.equal(r.claims[0].videoSays, 'no'); assert.match(r.claims[0].label, /don't clearly say/);
  const judgeBody = io.calls.anthropic.find(x => x.p === '/v1/messages' && /assess one claim/.test(x.body.messages[0].content)).body;
  assert.match(judgeBody.messages[0].content, /CAPTION PASSAGE: .*went up on Christmas Day 2021/);
  assert.ok(!JSON.stringify(r).includes('captionWindow'), 'caption passage kept out of the visitor result');
});

test('Fred re-check 3 #2: an unsaved cost blocks later checks in this process even if the marker file cannot be written', async () => {
  const dir = tmp(); const make = _internal.createBudget({ perRunUsdCap: 1, dailyUsdCap: 5, runDeadlineMs: 1e9 }, dir);
  const b = make(); const e = b.reserve(0.2, 'x');
  fs.writeFileSync(path.join(dir, 'spend-' + today() + '.json'), '{corrupt');
  fs.mkdirSync(path.join(dir, 'spend-UNRESOLVED.json')); // a directory: the marker append fails
  b.settle(e, 0.05);
  fs.rmSync(path.join(dir, 'spend-UNRESOLVED.json'), { recursive: true }); fs.writeFileSync(path.join(dir, 'spend-' + today() + '.json'), JSON.stringify({ usd: 0.2 }));
  assert.throws(() => make().reserve(0.1, 'next check'), /reconcile/);
});

test('Cary: only corrected names, places, numbers and dates count as guesses; word and grammar fixes do not', async () => {
  const run = async corrections => {
    const io = fakeIo({ judge: SUPPORT }); const orig = io.anthropic;
    io.anthropic = async (p, body, h) => {
      if (p === '/v1/messages' && /list the factual claims/.test(body.messages[0].content)) return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 60 }, content: [{ type: 'text', text: JSON.stringify({ video_kind: 'factual', caption_quality: 'good', garbled_passages: 0, note: '', claims: [
        { claim: 'NASA\'s James Webb Space Telescope launched on December 25, 2021.', video_quote: 'went up on Christmas Day 2021', search_query: 'Webb launch', corrections }] }) }] }) };
      return orig(p, body, h);
    };
    return createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  };
  const words = await run([{ heard: 'went up', written: 'launched', kind: 'word' }]);
  assert.equal(words.claims[0].dependsOnGuess, false); assert.equal(words.claims[0].verdict, 'supported');
  const place = await run([{ heard: 'carew french guyana', written: 'Kourou, French Guiana', kind: 'place' }]);
  assert.equal(place.claims[0].dependsOnGuess, true); assert.equal(place.claims[0].label, "Not established (caption unclear)");
  assert.deepEqual(place.claims[0].corrections, [{ heard: 'carew french guyana', written: 'Kourou, French Guiana', kind: 'place', matched: false }], 'kept, and marked as not matched to these captions');
});

test('Fred D2-D3: material corrections are found among all corrections; meaning changes and malformed lists hold back answers', async () => {
  const run = async corrections => {
    const io = fakeIo({ judge: SUPPORT }); const orig = io.anthropic;
    io.anthropic = async (p, body, h) => {
      if (p === '/v1/messages' && /list the factual claims/.test(body.messages[0].content)) { const claim = { claim: 'NASA\'s James Webb Space Telescope launched on December 25, 2021.', video_quote: 'went up on Christmas Day 2021', search_query: 'Webb' }; if (corrections !== undefined) claim.corrections = corrections;
        return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 60 }, content: [{ type: 'text', text: JSON.stringify({ video_kind: 'factual', caption_quality: 'good', garbled_passages: 0, note: '', claims: [claim] }) }] }) }; }
      return orig(p, body, h);
    };
    return (await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' })).claims[0];
  };
  const many = Array.from({ length: 13 }, (_, i) => ({ heard: 'w' + i, written: 'W' + i, kind: 'word' })).concat([{ heard: 'two', written: '20', kind: 'number' }]);
  const a = await run(many); assert.equal(a.dependsOnGuess, true, 'a number fix after many word fixes still counts'); assert.deepEqual(a.correctionsOmitted, { material: 0, minor: 2 }); assert.equal(a.corrections[0].kind, 'number', 'material fixes shown first');
  const b = await run([{ heard: 'does cause', written: 'does not cause', kind: 'meaning' }]); assert.equal(b.dependsOnGuess, true); assert.equal(b.verdict, 'insufficient');
  const c = await run(undefined); assert.equal(c.correctionsMalformed, true); assert.equal(c.verdict, 'insufficient', 'missing corrections list = uncertain');
  const d = await run([{ heard: 'x', written: 'y', kind: 'mystery' }]); assert.equal(d.dependsOnGuess, true);
  const e = await run([{ heard: 'went up', written: 'launched', kind: 'word' }]); assert.equal(e.verdict, 'supported', 'harmless spelling fix keeps the answer');
});

test('Fred G: corrections must be real strings and must match the captions and the claim', async () => {
  const run = async corrections => {
    const io = fakeIo({ judge: SUPPORT }); const orig = io.anthropic;
    io.anthropic = async (p, body, h) => {
      if (p === '/v1/messages' && /list the factual claims/.test(body.messages[0].content)) return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 60 }, content: [{ type: 'text', text: JSON.stringify({ video_kind: 'factual', caption_quality: 'good', garbled_passages: 0, note: '', claims: [
        { claim: 'NASA\'s James Webb Space Telescope launched on December 25, 2021.', video_quote: 'went up on Christmas Day 2021', search_query: 'Webb', corrections }] }) }] }) };
      return orig(p, body, h);
    };
    return (await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' })).claims[0];
  };
  const ok = await run([{ heard: 'went up', written: 'launched', kind: 'word' }]); assert.equal(ok.verdict, 'supported', 'bound harmless fix keeps the answer');
  const objField = await run([{ heard: { x: 1 }, written: 'launched', kind: 'word' }]); assert.equal(objField.correctionsMalformed, true); assert.equal(objField.verdict, 'insufficient');
  const missingHeard = await run([{ written: 'launched', kind: 'word' }]); assert.equal(missingHeard.correctionsMalformed, true);
  const fabricated = await run([{ heard: 'blue banana', written: 'red apple', kind: 'word' }]); assert.equal(fabricated.correctionsUnmatched, true); assert.equal(fabricated.verdict, 'insufficient');
  const insertion = await run([{ heard: '', written: 'launched', kind: 'word' }]); assert.equal(insertion.correctionsMalformed, false); assert.equal(insertion.verdict, 'supported', 'explicit insertion bound to the claim is allowed');
});

test('Timestamps: a claim passage found once gets the start time of its caption segment', async () => {
  const words = 'Hi everyone. The James Webb telescope went up on Christmas Day 2021, which is amazing. Also the moon is made of cheese, folks.';
  const segments = [{ c: 0, ms: 1200 }, { c: 13, ms: 65400 }, { c: 87, ms: 125000 }];
  const io = fakeIo({ judge: SUPPORT, transcript: { ok: true, title: 'T', source: 'fake timed', text: words, segments } });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.claims[0].saidAtSec, 65, 'Webb passage starts in the segment at 65.4 s');
  assert.equal(r.claims[1].saidAtSec, 125);
  const plain = await createCheckVideo({ io: fakeIo({ judge: SUPPORT }), runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(plain.claims[0].saidAtSec, null, 'no segments, no timestamp');
});

test('"Misleading" resting on an "other" source is held back', async () => {
  const io = fakeIo({ judge: c => /Webb Space Telescope launched/.test(c) ? { verdict: 'misleading', quote: 'The claim that Webb launched on Christmas Day 2021 is accurate; it lifted off on December 25, 2021 from Kourou.', source: 2, reason: 'x' } : null });
  io.exa = async () => ({ status: 200, body: JSON.stringify({ results: [{ url: 'https://science.nasa.gov/mission/webb/', title: 'NASA', text: 'x' }, { url: 'https://someblog.example/webb', title: 'Blog', text: EXA_ONLY_TEXT }] }) });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(r.claims[0].verdict, 'insufficient'); assert.match(r.claims[0].notes.join(' '), /misleading/);
});

test('"As of February 12, 2026," prefix (from the publish date) is not required in the captions', () => {
  assert.deepEqual(_internal.claimNumbersMissing('As of February 12, 2026, the House passed the act 220 to 207.', 'the house passed it 220 to 207 on thursday', 'house passed'), []);
});

// ---------- v2 (Bob decisions, November 22, 2026) ----------
test('v2 parts rule: label follows the weakest material part, enforced in code', () => {
  const pc = _internal.partsConflict;
  assert.equal(pc('supported', [{ part: 'a', status: 'backed' }, { part: 'b', status: 'backed' }]), null);
  assert.match(pc('supported', [{ part: 'a', status: 'backed' }, { part: 'b', status: 'not_established' }]), /not every material part/);
  assert.match(pc('supported', []), /did not list/);
  assert.match(pc('supported', undefined), /did not list/);
  assert.match(pc('supported', [{ part: 'a', status: 'maybe' }]), /no readable status/);
  assert.equal(pc('contradicted', [{ part: 'a', status: 'backed' }, { part: 'b', status: 'shown_false' }]), null);
  assert.match(pc('contradicted', [{ part: 'a', status: 'backed' }, { part: 'b', status: 'not_established' }]), /no part was shown false/);
  assert.equal(pc('insufficient', undefined), null);
});

test('v2: "supported" with an unproven part is withheld; "contradicted" with no false part is withheld', async () => {
  const partial = fakeIo({ judge: c => /Webb Space Telescope launched/.test(c) ? { verdict: 'supported', parts: [{ part: 'launched', status: 'backed' }, { part: 'on December 25, 2021', status: 'not_established' }], quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'Partly backed.' } : null });
  const r = await createCheckVideo({ io: partial, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r.claims[0].verdict, 'insufficient'); assert.equal(r.claims[0].label, 'Not established from the sources checked');
  assert.ok(r.claims[0].notes.some(n => /does not follow from the parts/.test(n)));
  assert.equal(r.claims[0].parts, null, 'held-back part verdicts stay private (Fred, v10 review)');
  const noFalse = fakeIo({ judge: c => /Webb Space Telescope launched/.test(c) ? { verdict: 'contradicted', parts: [{ part: 'launched', status: 'backed' }, { part: 'Ship 42', status: 'not_established' }], quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'x' } : null });
  const r2 = await createCheckVideo({ io: noFalse, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r2.claims[0].verdict, 'insufficient');
  const noParts = fakeIo({ judge: c => /Webb Space Telescope launched/.test(c) ? { verdict: 'supported', parts: undefined, quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'x' } : null });
  const r3 = await createCheckVideo({ io: noParts, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r3.claims[0].verdict, 'insufficient', 'a firm answer without a parts list is withheld');
});

test('v2: plain labels, factual summary, caution names claims not the creator, prompts carry the new rules', async () => {
  const io = fakeIo({ judge: c => /Webb Space Telescope launched/.test(c) ? { verdict: 'contradicted', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'Date differs.' } : null });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r.claims[0].label, 'Shown false by the evidence');
  assert.equal(r.summary, 'Main claim: Shown false by the evidence. Other claim checked (1): 0 backed by the sources checked, 0 shown false by the evidence, 1 not established from the sources checked.');
  assert.deepEqual(r.headline, { claim: r.claims[0].claim, verdict: 'contradicted', label: 'Shown false by the evidence' });
  assert.match(r.caution, /not a judgment of the whole video or of the person who made it/);
  assert.match(r.limits, /does not mean the claim is false/);
  const P = require('../pipeline.cjs');
  const p = P.judgePrompt('x', [], 'May 1, 2025', '');
  for (const rule of [/weakest part/, /MATERIAL difference/, /same wire story/, /governing text or primary record/, /missing confirming quotation never makes a part false/, /events that happened after that date may not decide/, /already true on that date/, /never by whether it came true/]) assert.match(p, rule);
  const cp = P.claimPrompt('t', 'c', 4, 'May 1, 2025');
  assert.match(cp, /incidental details/); assert.match(cp, /"political"/);
});

test('v2: on political claims only, network outlets are ordered after other reliable sources of the same role', async () => {
  const pubs = require('../publishers.cjs'), P = require('../pipeline.cjs');
  assert.equal(pubs.isNetwork('https://abcnews.go.com/Politics/x'), true); assert.equal(pubs.isNetwork('https://www.foxnews.com/politics/x'), true);
  assert.equal(pubs.isNetwork('https://www.newsmax.com/x'), true); assert.equal(pubs.isNetwork('https://apnews.com/x'), false);
  const page = t => '<html><body><main><p>' + t + ' The bill passed the Senate on May 1. '.repeat(20) + '</p></main></body></html>';
  const mk = () => ({ hasKeys: () => ({ anthropic: true, exa: true }),
    publicGet: async url => ({ ok: true, status: 200, html: page(url), text: page(url), content_type: 'text/html', url }),
    exa: async () => ({ status: 200, body: JSON.stringify({ costDollars: { total: 0.01 }, results: [
      { url: 'https://www.cbsnews.com/news/bill', title: 'CBS' }, { url: 'https://www.nbcnews.com/politics/bill', title: 'NBC' },
      { url: 'https://apnews.com/article/bill', title: 'AP' }, { url: 'https://www.reuters.com/world/bill', title: 'Reuters' }] }) }) });
  const cfg = Object.assign({}, P.DEFAULTS), dir = tmp();
  const ctxFor = () => ({ cfg, io: mk(), budget: _internal.createBudget(cfg, dir)({}) });
  const pol = await _internal.gatherEvidence(ctxFor(), { claim: 'The bill passed the Senate.', searchQuery: 'bill', political: true }, 'dQw4w9WgXcQ');
  assert.deepEqual(pol.sources.map(s => s.publisher), ['apnews.com', 'reuters.com', 'cbsnews.com', 'nbcnews.com']);
  const non = await _internal.gatherEvidence(ctxFor(), { claim: 'The bill passed the Senate.', searchQuery: 'bill', political: false }, 'dQw4w9WgXcQ');
  assert.deepEqual(non.sources.map(s => s.publisher), ['cbsnews.com', 'nbcnews.com', 'apnews.com', 'reuters.com']);
});

const CONTRA_NASA = c => /Webb Space Telescope launched/.test(c) ? { verdict: 'contradicted', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'Date differs.' } : null;
test('v3: every "shown false" finding gets a second check; anything but a clear confirmation withholds it', async () => {
  const ok = fakeIo({ judge: CONTRA_NASA });
  const r1 = await createCheckVideo({ io: ok, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r1.claims[0].verdict, 'contradicted'); assert.equal(r1.claims[0].secondCheck.confirmed, true);
  const vb = ok.calls.anthropic.find(x => x.p === '/v1/messages' && /double-check a "shown false" finding/.test(x.body.messages[0].content)).body.messages[0].content;
  assert.match(vb, /LATEST possible recording date/); assert.match(vb, /Excerpt \[1\] https:\/\/science\.nasa\.gov/);
  for (const v of [{ problem: 'recording_date', confirmed: false, reason: 'Could be true if recorded earlier.' }, { problem: 'said_claim', confirmed: true, reason: 'inconsistent' }, { confirmed: 'yes' }]) {
    const io = fakeIo({ judge: CONTRA_NASA, verify: () => v });
    const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    assert.equal(r.claims[0].verdict, 'insufficient', JSON.stringify(v)); assert.match(r.claims[0].reason, /second check did not confirm/);
    assert.ok(r.claims[0].notes.some(n => /second check did not confirm/.test(n)));
    assert.ok(!r.caution, 'no caution without a confirmed finding'); assert.doesNotMatch(r.summary, /1 shown false/);
  }
  const down = fakeIo({ judge: CONTRA_NASA }); const orig = down.anthropic;
  down.anthropic = async (p, body, h) => p === '/v1/messages' && /double-check a "shown false" finding/.test(body.messages[0].content) ? { status: 500, body: JSON.stringify({ error: { message: 'overloaded' } }) } : orig(p, body, h);
  const r3 = await createCheckVideo({ io: down, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r3.claims[0].verdict, 'insufficient'); assert.equal(r3.claims[0].secondCheck.problem, 'second check failed');
  const sup = fakeIo({ judge: c => /Webb Space Telescope launched/.test(c) ? { verdict: 'supported', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'x' } : null });
  await createCheckVideo({ io: sup, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(sup.calls.anthropic.filter(x => x.p === '/v1/messages' && /double-check a "shown false"/.test(x.body.messages[0].content)).length, 0, 'no shown-false check for a backed claim');
});

test('v3: prompts keep relative time words, measure them from an unknown recording date, and judge "said" claims as statements', () => {
  const P = require('../pipeline.cjs');
  const cp = P.claimPrompt('t', 'c', 4, 'May 1, 2025');
  assert.match(cp, /Keep relative time words exactly as the video says them/); assert.match(cp, /Never turn them into calendar dates/); assert.match(cp, /"page_terms"/);
  assert.doesNotMatch(cp, /state it as of the publication date/);
  const jp = P.judgePrompt('x', [], 'May 1, 2025', '');
  assert.match(jp, /RECORDING DATE/); assert.match(jp, /wrong for EVERY plausible recording date/); assert.match(jp, /N full years elapsed/);
  assert.match(jp, /never shown false by a value from a different or unknown moment/);
  assert.match(jp, /SAID CLAIMS/); assert.match(jp, /Whether what they said was accurate is NOT part of this claim/);
});

test('v3: page terms steer the excerpt, and a match deep inside one very long paragraph is still read verbatim', async () => {
  const H = require('../html-text.cjs');
  const filler = 'The committee met to review many unrelated budget matters over several sessions. ';
  const long = filler.repeat(120) + 'Norway is progressing slowly toward the target, the report found. ' + filler.repeat(120);
  const ex = H.buildExcerpt('Opening line of the report about defense spending goals.\n' + long, 'Norway progressing slowly', 4000);
  assert.match(ex.excerpt, /Norway is progressing slowly toward the target/); assert.ok(ex.excerpt.length <= 4000);
  for (const piece of ex.excerpt.split('\n[...]\n')) assert.ok(('Opening line of the report about defense spending goals.\n' + long).includes(piece), 'verbatim');
  const P = require('../pipeline.cjs');
  const page = '<html><body><main><p>' + 'General background about the agency and its many programs and offices. '.repeat(200) + '</p><p>Gan Eden is headed by Ben David according to the ministry listing.</p><p>' + 'More general background about other agency programs and staff. '.repeat(200) + '</p></main></body></html>';
  const io = { hasKeys: () => ({ anthropic: true, exa: true }), publicGet: async url => ({ ok: true, status: 200, html: page, text: page, content_type: 'text/html', url }),
    exa: async () => ({ status: 200, body: JSON.stringify({ costDollars: { total: 0.01 }, results: [{ url: 'https://www.gov.il/en/departments/x', title: 'gov' }] }) }) };
  const cfg = Object.assign({}, P.DEFAULTS, { excerptChars: 3000 });
  const ev = await _internal.gatherEvidence({ cfg, io, budget: _internal.createBudget(cfg, tmp())({}) }, { claim: 'The unit is run by its director.', searchQuery: 'x', political: false, pageTerms: ['Gan Eden', 'Ben David'] }, 'dQw4w9WgXcQ');
  assert.match(ev.sources[0].excerpt, /Gan Eden is headed by Ben David/);
});

const SUPPORT_NASA = c => /Webb Space Telescope launched/.test(c) ? { verdict: 'supported', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'NASA states the date.' } : null;
test('v4: every "backed" finding gets a detail check against all excerpts; any detail not stated withholds it', async () => {
  const ok = fakeIo({ judge: SUPPORT_NASA });
  const r1 = await createCheckVideo({ io: ok, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r1.claims[0].verdict, 'supported'); assert.equal(r1.claims[0].detailCheck.confirmed, true);
  const db = ok.calls.anthropic.find(x => x.p === '/v1/messages' && /double-check a "backed" finding/.test(x.body.messages[0].content)).body.messages[0].content;
  assert.match(db, /absolute or superlative word/); assert.match(db, /39-second flight is not a 30-second hover/); assert.match(db, /\[1\] https:\/\/science\.nasa\.gov/);
  for (const d of [{ details: [{ detail: 'launched', status: 'stated', source: 1 }, { detail: 'December 25, 2021', status: 'differs', source: 1 }], reason: 'Date differs.' },
    { details: [{ detail: 'launched', status: 'stated', source: 1 }, { detail: 'NASA', status: 'missing', source: 0 }], reason: 'x' }, { details: [], reason: 'none' }, { reason: 'no list' }]) {
    const io = fakeIo({ judge: SUPPORT_NASA, detail: () => d });
    const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    assert.equal(r.claims[0].verdict, 'insufficient', JSON.stringify(d)); assert.match(r.claims[0].reason, /detail check did not confirm/);
    assert.doesNotMatch(r.summary, /1 backed/); assert.ok(!r.caution, 'a differing detail is never turned into an accusation');
  }
  const down = fakeIo({ judge: SUPPORT_NASA }); const orig = down.anthropic;
  down.anthropic = async (p, body, h) => p === '/v1/messages' && /double-check a "backed" finding/.test(body.messages[0].content) ? { status: 500, body: JSON.stringify({ error: { message: 'overloaded' } }) } : orig(p, body, h);
  const r3 = await createCheckVideo({ io: down, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r3.claims[0].verdict, 'insufficient'); assert.equal(r3.claims[0].detailCheck.problem, 'detail check failed');
});

test('v4: a claim the caption rules will withhold skips the paid second checks', async () => {
  const io = fakeIo({ judge: SUPPORT_NASA, transcript: { ok: true, title: 'Webb facts', source: 'fake captions', text: 'Hi everyone. The James Webb telescope went up on Christmas Day 2020, which is amazing. Also the moon is made of cheese, folks.' } });
  const orig = io.anthropic;
  io.anthropic = async (p, body, h) => {
    const r = await orig(p, body, h);
    if (p === '/v1/messages' && /list the factual claims/.test(body.messages[0].content)) { const j = JSON.parse(r.body); const t = JSON.parse(j.content[0].text); t.claims[0].corrections = [{ heard: 'Christmas Day 2020', written: 'December 25, 2021', kind: 'date' }]; j.content[0].text = JSON.stringify(t); return { status: 200, body: JSON.stringify(j) }; }
    return r;
  };
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r.claims[0].verdict, 'insufficient');
  assert.equal(io.calls.anthropic.filter(x => x.p === '/v1/messages' && /double-check/.test(x.body.messages[0].content)).length, 0);
});

test('v4 option: a corrected name spelling found in the captions, the claim and a source is not a guess', () => {
  const P = require('../pipeline.cjs'), f = P._internal.nameFixesResolved;
  const claim = { dependsOnGuess: true, correctionsMalformed: false, correctionsUnmatched: false, correctionsOmitted: { material: 0, minor: 0 }, corrections: [{ heard: 'Odoaxer', written: 'Odoacer', kind: 'name', matched: true }] };
  const src = [{ excerpt: 'In 476 the Germanic leader Odoacer deposed Romulus Augustulus.' }];
  assert.equal(f(Object.assign({}, P.DEFAULTS, { nameFixesVerified: false }), claim, src), false, 'can be turned off');
  const on = Object.assign({}, P.DEFAULTS, { nameFixesVerified: true });
  assert.equal(f(on, claim, src), true);
  assert.equal(f(on, claim, [{ excerpt: 'No such name here.' }]), false, 'name must appear in a source');
  assert.equal(f(on, Object.assign({}, claim, { corrections: [{ heard: '1928', written: '1929', kind: 'number', matched: true }] }), [{ excerpt: '1929' }]), false, 'numbers stay strict');
  assert.equal(f(on, Object.assign({}, claim, { correctionsUnmatched: true }), src), false, 'an unmatched correction stays a guess');
});

// ---------- v5 ----------
const isRepair = x => x.p === '/v1/messages' && /You fix ONE claim/.test(x.body.messages[0].content);
const REWRITE = () => ({ claim: 'The James Webb Space Telescope launched on December 25, 2021.', video_quote: 'The James Webb telescope went up on Christmas Day 2021', search_query: 'Webb launch date', page_terms: [], political: false, corrections: [] });
const D = (detail, status, kind, inVideo) => ({ detail, status, source: status === 'missing' ? 0 : 1, kind, in_video: inVideo });

test('v5: a detail that differs only in wording does not withhold a backed finding; a material one does', async () => {
  const wording = () => ({ details: [D('launched', 'stated', 'action', true), D('NASA\'s', 'differs', 'wording', true)], reason: 'x' });
  const r1 = await createCheckVideo({ io: fakeIo({ judge: SUPPORT_NASA, detail: wording }), runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r1.claims[0].verdict, 'supported'); assert.equal(r1.claims[0].detailCheck.wordingOnly, 1);
  const number = () => ({ details: [D('launched', 'stated', 'action', true), D('2021', 'differs', 'number', true)], reason: 'x' });
  const r2 = await createCheckVideo({ io: fakeIo({ judge: SUPPORT_NASA, detail: number }), runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r2.claims[0].verdict, 'insufficient');
  const off = await createCheckVideo({ io: fakeIo({ judge: SUPPORT_NASA, detail: wording }), runsDir: tmp(), config: { wordingTolerant: false } }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(off.claims[0].verdict, 'insufficient', 'can be turned off');
  const io = fakeIo({ judge: SUPPORT_NASA }); await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  const db = io.calls.anthropic.find(x => x.p === '/v1/messages' && /double-check a "backed" finding/.test(x.body.messages[0].content)).body.messages[0].content;
  assert.match(db, /Video caption passage/); assert.match(db, /Christmas Day 2021/); assert.match(db, /When unsure, do not use "wording"/);
});

test('v5: when every failing detail was added by the claim writer, the claim is rewritten once and judged again', async () => {
  const detail = c => /Claim: NASA's/.test(c) ? { details: [D('launched', 'stated', 'action', true), D('NASA\'s', 'missing', 'person_or_org', false)], reason: 'x' } : { details: [D('launched', 'stated', 'action', true)], reason: 'ok' };
  const io = fakeIo({ judge: SUPPORT_NASA, detail, repair: REWRITE });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  const c = r.claims[0];
  assert.equal(c.verdict, 'supported'); assert.match(c.repairedFrom, /NASA's/); assert.doesNotMatch(c.claim, /NASA/);
  assert.equal(c.firstTry.detailCheck.addedOnly, true); assert.equal(c.central, true);
  assert.equal(io.calls.anthropic.filter(isRepair).length, 1);
  const rp = io.calls.anthropic.find(isRepair).body.messages[0].content;
  assert.match(rp, /even if you think the video is wrong/); assert.match(rp, /does not say: NASA's/);
  // A failing detail the video itself said is never rewritten away.
  const said = c2 => ({ details: [D('launched', 'stated', 'action', true), D('NASA\'s', 'missing', 'person_or_org', true)], reason: 'x' });
  const io2 = fakeIo({ judge: SUPPORT_NASA, detail: said, repair: REWRITE });
  const r2 = await createCheckVideo({ io: io2, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r2.claims[0].verdict, 'insufficient'); assert.equal(io2.calls.anthropic.filter(isRepair).length, 0);
  // A rewrite whose quote is not in the captions is discarded.
  const io3 = fakeIo({ judge: SUPPORT_NASA, detail, repair: () => Object.assign(REWRITE(), { video_quote: 'words the video never said' }) });
  const r3 = await createCheckVideo({ io: io3, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r3.claims[0].verdict, 'insufficient'); assert.equal(r3.claims[0].repairedFrom, undefined);
  // Turned off: no rewrite.
  const io4 = fakeIo({ judge: SUPPORT_NASA, detail, repair: REWRITE });
  await createCheckVideo({ io: io4, runsDir: tmp(), config: { repairClaims: false } }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(io4.calls.anthropic.filter(isRepair).length, 0);
});

test('v5: a claim with numbers the captions do not say is rewritten from the passage before the search', async () => {
  const io = fakeIo({ judge: SUPPORT_NASA, repair: REWRITE });
  const orig = io.anthropic;
  io.anthropic = async (p, body, h) => {
    const r = await orig(p, body, h);
    if (p === '/v1/messages' && /list the factual claims/.test(body.messages[0].content)) { const j = JSON.parse(r.body); const t = JSON.parse(j.content[0].text); t.claims[0].claim = 'NASA\'s James Webb Space Telescope, with a 6.5-meter mirror, launched on December 25, 2021.'; j.content[0].text = JSON.stringify(t); return { status: 200, body: JSON.stringify(j) }; }
    return r;
  };
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  const c = r.claims[0];
  assert.match(c.repairedFrom, /6\.5/); assert.doesNotMatch(c.claim, /6\.5/); assert.deepEqual(c.missingNumbers, []);
  assert.equal(c.verdict, 'supported');
  assert.match(io.calls.anthropic.find(isRepair).body.messages[0].content, /number\(s\) 6\.5/);
});

test('v5: when the sources do not settle a claim, one more search with the judge\'s query, then judge again', async () => {
  const PRIMARY = 'NASA mission record. The James Webb Space Telescope launched on December 25, 2021 at 7:20 a.m. EST from Kourou. ' + 'Mission background text. '.repeat(20);
  const judge = c => !/Webb Space Telescope launched/.test(c) ? null : /mission record/.test(c) ? { verdict: 'supported', quote: 'The James Webb Space Telescope launched on December 25, 2021 at 7:20 a.m. EST from Kourou.', source: 1, reason: 'The record states it.', next_search: '' }
    : { verdict: 'insufficient', quote: '', source: 0, reason: 'Not settled.', next_search: 'NASA Webb launch mission record', parts: [{ part: 'launch date', status: 'not_established' }] };
  const io = fakeIo({ judge }); const orig = io.exa;
  io.exa = async (p, body) => body.query === 'NASA Webb launch mission record' ? { status: 200, body: JSON.stringify({ costDollars: { total: 0.015 }, results: [{ url: 'https://www.nasa.gov/webb-launch-record', title: 'record', text: PRIMARY }] }) } : orig(p, body);
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  const c = r.claims[0];
  assert.equal(c.verdict, 'supported'); assert.equal(c.secondSearch.query, 'NASA Webb launch mission record'); assert.equal(c.secondSearch.newSources, 1);
  assert.equal(c.sources[0].url, 'https://www.nasa.gov/webb-launch-record', 'new pages first');
  assert.ok(c.sources.length <= 6);
  const jp = io.calls.anthropic.find(x => x.p === '/v1/messages' && /You assess one claim/.test(x.body.messages[0].content)).body.messages[0].content;
  assert.match(jp, /"next_search": when the verdict is "insufficient"/);
  // No new pages: no second judgment. Turned off: no second search.
  const io2 = fakeIo({ judge }); await createCheckVideo({ io: io2, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  const judged = x => x.p === '/v1/messages' && /You assess one claim/.test(x.body.messages[0].content) && /Webb Space Telescope launched/.test(x.body.messages[0].content);
  assert.equal(io2.calls.anthropic.filter(judged).length, 1); assert.equal(io2.calls.exa.length, 3, 'two first searches plus one second search');
  const io3 = fakeIo({ judge }); await createCheckVideo({ io: io3, runsDir: tmp(), config: { secondSearch: false } }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(io3.calls.exa.length, 2);
});

test('v6: a "shown false" finding needs the video\'s own words for the false part, adding nothing to them', async () => {
  const cases = [
    [{ problem: 'none', confirmed: true, video_words: 'The James Webb telescope went up on Christmas Day 2021', part_adds_detail: false, reason: 'x' }, 'contradicted'],
    [{ problem: 'none', confirmed: true, video_words: 'Webb went up from a farm in Kansas', part_adds_detail: false, reason: 'words not in the captions' }, 'insufficient'],
    [{ problem: 'none', confirmed: true, video_words: 'The James Webb telescope went up on Christmas Day 2021', part_adds_detail: true, reason: 'part adds a setting' }, 'insufficient'],
    [{ problem: 'none', confirmed: true, video_words: '', part_adds_detail: false, reason: 'no words' }, 'insufficient'],
    [{ problem: 'none', confirmed: true, reason: 'old answer shape' }, 'insufficient']];
  for (const [v, want] of cases) {
    const r = await createCheckVideo({ io: fakeIo({ judge: CONTRA_NASA, verify: () => v }), runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    assert.equal(r.claims[0].verdict, want, JSON.stringify(v));
    if (want === 'insufficient') assert.equal(r.claims[0].secondCheck.problem, 'claim_not_in_video');
  }
});

test('v6: the source the video names is kept only when the captions say it, and is searched with the claim', async () => {
  const b = _internal.buildClaim({ claim: 'Heavy metals were found in 70% of protein powders tested.', video_quote: 'heavy metals in 70% of protein powders', source_named: 'Consumer Reports', search_query: 'protein powder heavy metals 70%', corrections: [] }, 0, 'Consumer Reports found heavy metals in 70% of protein powders they tested.', null);
  assert.equal(b.sourceNamed, 'Consumer Reports');
  const made = _internal.buildClaim({ claim: 'x', video_quote: 'heavy metals in 70% of protein powders', source_named: 'Clean Label Project', search_query: 'q', corrections: [] }, 0, 'Consumer Reports found heavy metals in 70% of protein powders they tested.', null);
  assert.equal(made.sourceNamed, '', 'a source the video never names is dropped');
  const io = fakeIo({ transcript: { ok: true, title: 'Webb', source: 'fake', text: 'NASA says the James Webb telescope went up on Christmas Day 2021.' } }), orig = io.anthropic;
  io.anthropic = async (p, body) => /list the factual claims/.test(body.messages[0].content) ? { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify({ video_kind: 'factual', note: '', claims: [
    { claim: 'The James Webb telescope launched on Christmas Day 2021.', video_quote: 'the James Webb telescope went up on Christmas Day 2021', search_query: 'Webb launch date', source_named: 'NASA', corrections: [] }] }) }] }) } : orig(p, body);
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(io.calls.exa[0].query, 'NASA Webb launch date');
  assert.match(io.calls.anthropic.find(x => /assess one claim/.test(x.body.messages[0] && x.body.messages[0].content)).body.messages[0].content, /The video names its source for this claim: NASA/);
  assert.equal(r.claims[0].sourceNamed, 'NASA');
});

test('v6: prompts carry the separate-claims rule and the strict backed-detail rules', () => {
  const P = require('../pipeline.cjs');
  const cp = P.claimPrompt('t', 'c', 4, 'May 1, 2025');
  assert.match(cp, /SEPARATE facts, not examples, figures or details that only support the central claim/); assert.match(cp, /"source_named"/);
  const dp = _internal.detailPrompt({ claim: 'x' }, [], 'May 1, 2025');
  for (const rule of [/states it as its own finding/, /same whole group/, /primary\/official excerpt decides/, /current within about a year/]) assert.match(dp, rule);
});

const SUP_NASA = c => /Webb Space Telescope launched/.test(c) ? { verdict: 'supported', quote: 'Webb launched on Dec. 25th 2021 aboard an Ariane 5 rocket from French Guiana.', source: 1, reason: 'NASA states the date.' } : null;
function withClaims(io, extra) {
  const orig = io.anthropic;
  io.anthropic = async (p, body) => {
    if (p === '/v1/messages' && /list the factual claims/.test(body.messages[0].content)) {
      const r = await orig(p, body); const outer = JSON.parse(r.body), inner = JSON.parse(outer.content[0].text);
      outer.content[0].text = JSON.stringify(Object.assign(inner, extra)); return { status: 200, body: JSON.stringify(outer) };
    }
    return orig(p, body);
  };
  return io;
}

test('v7: a video outside the scope is declined before any search, with the approved purpose line', async () => {
  const io = withClaims(fakeIo({ judge: SUP_NASA }), { in_scope: false, scope_reason: 'A gadget review with no claims that could harm or mislead.' });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r.ok, true); assert.equal(r.outOfScope, true); assert.deepEqual(r.claims, []);
  assert.match(r.summary, /^AIVerify checks videos to show whether they line up with the truth according to the Scriptures\. This video is outside what AIVerify checks\./);
  assert.equal(io.calls.exa.length, 0, 'no paid search for a declined video');
  assert.doesNotMatch(r.summary, /Bible|KJV/);
  const inScope = await createCheckVideo({ io: fakeIo({ judge: SUP_NASA }), runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.ok(!inScope.outOfScope, 'a missing in_scope answer is treated as in scope');
});

test('v7: a list video has no single main claim in the headline', async () => {
  const r = await createCheckVideo({ io: withClaims(fakeIo({ judge: SUP_NASA }), { list_video: true }), runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r.headline.verdict, 'list'); assert.match(r.headline.claim, /no single main claim/);
  assert.match(r.summary, /^Claims checked \(2\): 1 backed/);
});

test('v7: "backed" needs a second, independent judge (Opus 5.5) to agree', async () => {
  const io = fakeIo({ judge: SUP_NASA });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r.claims[0].verdict, 'supported'); assert.equal(r.claims[0].secondJudge.agrees, true);
  const opus = io.calls.anthropic.filter(x => x.p === '/v1/messages' && x.body.model === 'claude-opus-5-5');
  assert.equal(opus.length, 1, 'one second-judge call for the one backed claim');
  assert.ok(!('thinking' in opus[0].body), 'Opus 5.5: thinking is not sent (it cannot be disabled)');
  assert.equal(opus[0].body.output_config.effort, 'medium');
  for (const other of [{ verdict: 'insufficient', quote: '', source: 0, reason: 'Not settled.' }, { verdict: 'supported', quote: 'x', source: 1, reason: 'x', parts: [{ part: 'date', status: 'not_established' }] }, { verdict: 'supported', quote: 'x', source: 1, reason: 'x', video_says: 'unclear' }]) {
    const io2 = fakeIo({ judge: SUP_NASA }), orig = io2.anthropic;
    io2.anthropic = async (p, body) => p === '/v1/messages' && body.model === 'claude-opus-5-5' ? { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'text', text: JSON.stringify(Object.assign({ video_says: 'yes', parts: [{ part: 'the claim', status: other.verdict === 'supported' ? 'backed' : 'not_established' }], next_search: '' }, other)) }] }) } : orig(p, body);
    const r2 = await createCheckVideo({ io: io2, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    assert.equal(r2.claims[0].verdict, 'insufficient', JSON.stringify(other)); assert.match(r2.claims[0].reason, /No firm answer is given: the second judge did not agree/);
  }
});

test('v7: prompts carry the scope rule, the opening and closing, and the hedge rule; Opus is priced at its own rate', () => {
  const P = require('../pipeline.cjs');
  const long = Array.from({ length: 400 }, (_, i) => 'w' + i).join(' ');
  const cp = P.claimPrompt('t', long, 4, 'May 1, 2025');
  assert.match(cp, /"in_scope"/); assert.match(cp, /"list_video"/); assert.match(cp, /never the opening hook/);
  assert.match(cp, /Opening \(first part of the captions\): w0 w1/); assert.match(cp, /Closing \(last part of the captions\): .*w399/);
  assert.doesNotMatch(P.claimPrompt('t', 'short captions', 4, ''), /Opening \(first part/);
  assert.match(P.judgePrompt('x', [], '', ''), /HEDGES AND UNCLEAR TERMS/);
  assert.match(require('fs').readFileSync(require('path').join(__dirname, '..', 'pipeline.cjs'), 'utf8'), /'claude-opus-5-5': \[4, 20\]/);
});

test('an empty search account (Exa HTTP 402) stops the check instead of judging claims without a search', async () => {
  const io = fakeIo({ judge: SUP_NASA }); io.exa = async () => ({ status: 402, body: JSON.stringify({ error: 'credits' }) });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r.ok, false); assert.equal(r.stage, 'provider'); assert.match(r.error, /credits are used up/);
});

test('videos under 3 minutes are declined before any model call; unknown length is checked', async () => {
  const io = fakeIo({ judge: SUP_NASA, transcript: { ok: true, title: 'Webb', source: 'fake', durationSec: 95, text: 'Hi everyone. The James Webb telescope went up on Christmas Day 2021, which is amazing.' } });
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r.ok, true); assert.equal(r.tooShort, true); assert.match(r.summary, /3 minutes or longer; this one is shorter\./);
  assert.equal(io.calls.anthropic.length, 0); assert.equal(io.calls.exa.length, 0);
  const long = fakeIo({ judge: SUP_NASA, transcript: { ok: true, title: 'Webb', source: 'fake', durationSec: 400, text: 'Hi everyone. The James Webb telescope went up on Christmas Day 2021, which is amazing. Also the moon is made of cheese, folks.' } });
  const r2 = await createCheckVideo({ io: long, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.ok(!r2.tooShort); assert.equal(r2.claims.length, 2);
});

test('scriptures: a claim about what the Scriptures say is checked against the local text, with no web search; teachings get local verses', async () => {
  const S = require('../../scriptures/scriptures.cjs');
  assert.equal(S.lookup('1 Tim. 6:10')[0].ref, '1 Timothy 6:10'); assert.match(S.lookup('1 Timothy 6:10')[0].text, /^For the love of money is the root of all evil/);
  assert.equal(S.lookup('Hezekiah 1:1').length, 0, 'no such book');
  assert.equal(S.search('money is the root of all evil', 1)[0].ref, '1 Timothy 6:10');
  assert.equal(S.lookup('Sirach 1:1')[0].tier, 2);
  const io = fakeIo({ transcript: { ok: true, title: 'Money', source: 'fake', text: 'The Bible says money is the root of all evil, so stay poor and you will be holy.' },
    judge: c => /money is the root of all evil/.test(c) && /Role "scripture"/.test(c) ? { verdict: 'contradicted', quote: 'For the love of money is the root of all evil', source: 1, reason: 'The passage says the love of money.', parts: [{ part: 'money is the root of all evil', status: 'shown_false' }] } : null,
    verify: () => ({ problem: 'none', confirmed: true, video_words: 'The Bible says money is the root of all evil', part_adds_detail: false, reason: 'x' }) });
  const orig = io.anthropic;
  io.anthropic = async (p, body) => p === '/v1/messages' && /list the factual claims/.test(body.messages[0].content) ? { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify({ video_kind: 'faith', in_scope: true, scope_reason: 'x', list_video: false, note: '',
    teachings: [{ teaching: 'Poverty makes a person holy.', refs: ['Proverbs 30:8', 'Hezekiah 4:4'] }],
    claims: [{ claim: 'The Bible says money is the root of all evil.', video_quote: 'The Bible says money is the root of all evil', search_query: 'q', kind: 'scripture', scripture_refs: ['1 Timothy 6:10', 'Nowhere 1:1'], corrections: [] }] }) }] }) } : orig(p, body);
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r.ok, true, r.error); assert.equal(io.calls.exa.length, 0, 'no web search for a scripture claim');
  const c = r.claims[0]; assert.equal(c.kind, 'scripture'); assert.deepEqual(c.scriptureRefs, ['1 Timothy 6:10']);
  assert.equal(c.sources[0].publisher, '1 Timothy 6:10'); assert.equal(c.sources[0].role, 'scripture');
  assert.equal(c.verdict, "contradicted", JSON.stringify({ notes: c.notes, reason: c.reason, wh: c.wouldHaveBeen, rel: r.reliability })); assert.match(c.quote.text, /love of money/);
  assert.equal(r.teachings.length, 1); assert.equal(r.teachings[0].verses[0].ref, 'Proverbs 30:8'); assert.match(r.teachings[0].verses[0].text, /^Remove far from me vanity and lies/);
  assert.doesNotMatch(JSON.stringify(r.teachings) + r.summary, /KJV|King James/);
});

test('scriptures: words the translators added stay marked for checks, and never decide a "shown false" finding', () => {
  const S = require('../../scriptures/scriptures.cjs');
  const v = S.lookup('2 Samuel 21:19')[0];
  assert.match(v.marked, /slew \[the brother of\] Goliath/); assert.match(v.text, /slew the brother of Goliath/);
  assert.match(require('../pipeline.cjs').judgePrompt('x', [], '', ''), /Words in \[square brackets\] in a passage were added by the translators/);
});

test('scriptures: 1 Enoch (tier 2) is available locally', () => {
  const S = require('../../scriptures/scriptures.cjs');
  const v = S.lookup('Enoch 1:9')[0]; assert.equal(v.ref, '1 Enoch 1:9'); assert.equal(v.tier, 2); assert.match(v.text, /ten thousands of His holy ones/);
  assert.equal(S.lookup('1 Enoch 108:15').length, 1);
});

function claimsIo(extra, opts) {
  const io = fakeIo(opts || {}), orig = io.anthropic;
  io.anthropic = async (p, body) => {
    if (p === '/v1/messages' && /list the factual claims/.test(body.messages[0].content)) {
      const base = { video_kind: 'faith', in_scope: true, scope_reason: 'x', list_video: false, main_point: '', main_point_kind: 'fact', note: '', teachings: [], claims: [] };
      return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify(Object.assign(base, extra)) }] }) };
    }
    if (p === '/v1/messages' && body.model === 'claude-haiku-5-5' && opts && opts.rate) { io.lastRate = body; } if (p === '/v1/messages' && body.model === 'claude-haiku-5-5' && opts && opts.rate) return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'text', text: JSON.stringify(opts.rate(body.messages[0].content)) }] }) };
    return orig(p, body);
  };
  return io;
}
const WEBB = { claim: 'NASA\'s James Webb Space Telescope launched on December 25, 2021.', video_quote: 'The James Webb telescope went up on Christmas Day 2021', search_query: 'Webb launch date', kind: 'fact', scripture_refs: [], corrections: [] };

test('v10 beta: a web-checked factual claim lists its sources with no verdict and no judging cost', async () => {
  const io = claimsIo({ main_point: 'Webb launched on Christmas Day 2021.', claims: [WEBB] }, { judge: SUP_NASA });
  const r = await P0.createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  const c = r.claims[0];
  assert.equal(c.sourcesOnly, true); assert.equal(c.verdict, 'insufficient'); assert.equal(c.label, 'Sources found (no verdict in this beta)');
  assert.ok(c.sources.length > 0, 'sources are listed'); assert.equal(io.calls.exa.length, 1);
  assert.equal(io.calls.anthropic.filter(x => x.p === '/v1/messages').length, 0, 'no judge, detail check or second judge (the claim writer is answered before the call log)');
});

test('v10: a teaching main point is the headline with no verdict; its claims are not the main claim', async () => {
  const io = claimsIo({ main_point: 'Burial is better than cremation as a witness to the resurrection.', main_point_kind: 'teaching', teachings: [{ teaching: 'Burial is better than cremation.', refs: ['Genesis 23:19', '1 Corinthians 15:42'] }], claims: [WEBB] }, { judge: SUP_NASA });
  const r = await P0.createCheckVideo({ io, runsDir: tmp(), config: { rateVerses: false } }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.deepEqual(r.headline, { claim: 'Burial is better than cremation as a witness to the resurrection.', verdict: 'teaching', label: 'A teaching: see the Related Scriptures below.' });
  assert.equal(r.claims[0].central, false); assert.match(r.summary, /^Main point: a teaching/);
  assert.equal(r.teachings[0].verses[0].ref, 'Genesis 23:19');
});

test('v10: related passages are rated for relevance (not agreement), best first; top 3 shown, the rest folded, weak ones dropped', async () => {
  const refs = ['Genesis 1:1', 'Genesis 1:2', 'Genesis 1:3', 'Genesis 1:4', 'Genesis 1:5', 'Genesis 1:6'];
  const scores = { 'Genesis 1:1': 2, 'Genesis 1:2': 0, 'Genesis 1:3': 3, 'Genesis 1:4': 1, 'Genesis 1:5': 3, 'Genesis 1:6': 2 };
  let prompt = '';
  const io = claimsIo({ main_point: 'God created the world in six days.', main_point_kind: 'teaching', teachings: [{ teaching: 'God created the world in six days.', refs }], claims: [] },
    { rate: c => { prompt = c; return { ratings: refs.map(r => ({ teaching: 1, ref: r, score: scores[r] })) }; } });
  const r = await P0.createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  const t = r.teachings[0];
  assert.deepEqual(t.verses.map(v => v.ref), ['Genesis 1:3', 'Genesis 1:5', 'Genesis 1:1']);
  assert.deepEqual(t.moreVerses.map(v => v.ref), ['Genesis 1:6']);
  assert.match(prompt, /Never rate whether a passage agrees or disagrees/);
  assert.equal(io.lastRate.output_config.effort, 'low'); assert.ok(!('thinking' in io.lastRate));
  assert.match(r.summary, /^Main point: a teaching/);
});

test('v10: a named passage is read with its context verses; hedges include "can"; "no good evidence" never shows a claim false', () => {
  const S = require('../../scriptures/scriptures.cjs');
  const v = S.lookupWithContext('Revelation 11:3', 2);
  assert.deepEqual(v.map(x => x.context), [true, true, false, true, true]);
  const p = P0.judgePrompt('x', [], '', '');
  assert.match(p, /"can", "could"/); assert.match(p, /no good evidence for a claim[^"]*leave it "not_established", never "shown_false"/);
  assert.match(p, /Read the claim in the sense the CAPTION PASSAGE gives it/);
});

test('v10 beta: a user suggestion is saved only with a valid run, claim number and note', () => {
  const dir = tmp(), cv = P0.createCheckVideo({ io: fakeIo(), runsDir: dir });
  assert.equal(cv.saveReport({ runId: '2026-11-23T20-00-00Z-abc123', n: 2, kind: 'verse', note: '  Also see James 1:5.  ' }), true);
  for (const bad of [{ runId: 'x', n: 2, note: 'a' }, { runId: '2026-11-23T20-00-00Z-abc123', n: 0, note: 'a' }, { runId: '2026-11-23T20-00-00Z-abc123', n: 2, note: '   ' }]) assert.equal(cv.saveReport(bad), false);
  const rows = require('fs').readFileSync(require('path').join(dir, 'user-suggestions.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 1); assert.equal(rows[0].note, 'Also see James 1:5.'); assert.equal(rows[0].kind, 'verse'); assert.equal(rows[0].claim, 2);
});

test('v10: a quotation whose words are at a different verse of the same book is never shown false for the number alone', () => {
  assert.match(P0.judgePrompt('x', [], '', ''), /only the number differs\), the part is "not_established", never "shown_false", because captions often garble spoken numbers/);
});

test('v10: modern-translation wording and Gospel speakers are not treated as material differences in scripture checks', () => {
  assert.match(P0.judgePrompt('x', [], '', ''), /"slave" for "servant"/);
  assert.match(_internal.detailPrompt({ claim: 'x' }, [], ''), /A translation-wording difference is kind "wording"/);
  assert.match(P0.judgePrompt('x', [], '', ''), /in the Gospels, words from a passage of Jesus' teaching are his unless the excerpt shows another speaker/);
});

test('v10: long text is shortened at a word boundary, never mid-word', () => {
  const s = 'word '.repeat(200).trim();
  const c = _internal.clipWords(s, 33); assert.ok(c.endsWith('…')); assert.match(c, /^(word )*word…$/);
  assert.equal(_internal.clipWords('short', 600), 'short');
});

test('v10: the main point keeps the speaker\'s own qualifiers and strength', () => {
  assert.match(P0.claimPrompt('t', 'c', 4, ''), /"may" stays "may", never "often"/);
});

test('v10: a claim that a saying is not in the Scriptures is checked against the closest passages in the whole text', () => {
  assert.match(P0.judgePrompt('x', [], '', ''), /A claim that a saying or words are NOT in the Scriptures/);
  assert.match(P0.claimPrompt('t', 'c', 4, ''), /or that a saying is not in the Bible/);
});

test('v10: "not in the Bible" can be backed without a quote (scripture passages only, second judge must agree); a reworded claim keeps its kind', async () => {
  const io = claimsIo({ main_point: 'Some popular sayings are not in the Bible.', claims: [{ claim: "The saying 'God helps those who help themselves' is not in the Bible.", video_quote: 'God helps those who help themselves', search_query: 'q', kind: 'scripture', scripture_refs: [], corrections: [] }] },
    { transcript: { ok: true, title: 'Sayings', source: 'fake', text: 'People say God helps those who help themselves, but that is not in the Bible at all.' },
      judge: c => /God helps those who help themselves/.test(c) ? { verdict: 'supported', quote: '', source: 0, reason: 'None of the closest passages has the saying.', parts: [{ part: 'not in the Bible', status: 'backed' }] } : null });
  const r = await P0.createCheckVideo({ io, runsDir: tmp(), config: { rateVerses: false } }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  const c = r.claims[0];
  assert.equal(c.verdict, 'supported', JSON.stringify(c.notes)); assert.equal(c.quote, null); assert.ok(c.secondJudge && c.secondJudge.agrees, 'second judge ran and agreed');
  assert.equal(io.calls.exa.length, 0);
  assert.match(require('fs').readFileSync(require('path').join(__dirname, '..', 'pipeline.cjs'), 'utf8'), /kind: claim\.kind, scriptureRefs:/);
});

test('AIVerify\'s own explanations say "the Scriptures", never "KJV" or "Bible"', () => {
  assert.equal(_internal.userText('1 Timothy 6:10 (KJV) says the love of money'), '1 Timothy 6:10 says the love of money');
  assert.equal(_internal.userText('It is not in the Bible. The Bible never says it.'), 'It is not in the Scriptures. The Scriptures never say it.');
  assert.doesNotMatch(_internal.userText('Matthew 1:16 in KJV 1769 and biblical texts'), /KJV|Bible|biblical/);
});

test('published claim statements follow the wording rule; the video quote stays as said', async () => {
  const io = claimsIo({ main_point: 'x', claims: [{ claim: 'The Bible says money is the root of all evil.', video_quote: 'The Bible says money is the root of all evil', search_query: 'q', kind: 'scripture', scripture_refs: ['1 Timothy 6:10'], corrections: [] }] },
    { transcript: { ok: true, title: 'Money', source: 'fake', text: 'The Bible says money is the root of all evil, so stay poor.' } });
  const r = await P0.createCheckVideo({ io, runsDir: tmp(), config: { rateVerses: false } }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r.claims[0].claim, 'The Scriptures say money is the root of all evil.');
  assert.doesNotMatch(r.claims[0].claim, /Bible/); assert.match(r.claims[0].videoQuote, /The Bible says/); assert.equal(r.claims[0].claimAsWritten, 'The Bible says money is the root of all evil.');
});

test('v10: the top line is the whole-video main point for fact videos too, not the first checkable detail', async () => {
  const io = claimsIo({ main_point: 'Seed cycling balances hormones through the menstrual cycle.', main_point_kind: 'fact', claims: [WEBB] }, { judge: SUP_NASA });
  const r = await P0.createCheckVideo({ io, runsDir: tmp(), config: { rateVerses: false } }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.deepEqual(r.headline, { claim: 'Seed cycling balances hormones through the menstrual cycle.', verdict: 'point', label: 'See the claims checked below.' });
});

test('Fred v10 review: absence rule only for explicit absence; held-back answers show no confident reasoning or parts; huge verse numbers rejected; scope-preserving wording; failed rating shows no verses', async () => {
  assert.equal(_internal.ABSENCE_RE.test('The Bible says do not eat vegetables.'), false);
  assert.equal(_internal.ABSENCE_RE.test('That saying is not found in the Bible.'), true);
  const S = require('../../scriptures/scriptures.cjs');
  assert.equal(S.parseRef('Genesis 1:9007199254740992'), null); assert.equal(S.lookupWithContext('Genesis 1:9007199254740992', 2).length, 0);
  assert.equal(_internal.userText('This wording occurs only in the KJV translation.'), 'This wording occurs only in the translation checked.');
  assert.equal(_internal.withheldText(['firm answer withheld: the second judge did not agree it is backed (verdict insufficient)']), 'No firm answer is given: the second judge did not agree it is backed.');
  // second judge disagrees -> published reason is the held-back reason only, parts hidden
  const io = fakeIo({ judge: SUP_NASA }), orig = io.anthropic;
  io.anthropic = async (p, body) => p === '/v1/messages' && body.model === 'claude-opus-5-5' ? { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify({ video_says: 'yes', verdict: 'insufficient', parts: [{ part: 'x', status: 'not_established' }], quote: '', source: 0, reason: 'no', next_search: '' }) }] }) } : orig(p, body);
  const r = await createCheckVideo({ io, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(r.claims[0].verdict, 'insufficient'); assert.equal(r.claims[0].parts, null); assert.equal(r.claims[0].quote, null);
  assert.match(r.claims[0].reason, /^No firm answer is given: the second judge did not agree/); assert.doesNotMatch(r.claims[0].reason, /NASA states/);
  // failed rating -> no Related Scriptures
  const io2 = claimsIo({ main_point: 'x', main_point_kind: 'teaching', teachings: [{ teaching: 'x', refs: ['John 3:16'] }], claims: [] }, { rate: () => ({ nope: true }) });
  const r2 = await P0.createCheckVideo({ io: io2, runsDir: tmp() }).run({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.deepEqual(r2.teachings, []);
});
