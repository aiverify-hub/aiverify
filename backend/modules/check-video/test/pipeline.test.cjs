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
        { claim: 'NASA\'s James Webb Space Telescope launched on December 25, 2021.', video_quote: 'The James Webb telescope went up on Christmas Day 2021', search_query: 'Webb launch date', corrections: [] },
        { claim: 'The Moon is made of cheese.', video_quote: 'the moon is made of cheese', search_query: 'moon composition', corrections: [] }] }) }] }) };
      // v3 second check of "shown false" findings: confirms by default; tests of the check set o.verify.
      if (/double-check a "shown false" finding/.test(content)) return { status: 200, body: JSON.stringify({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: JSON.stringify(o.verify ? o.verify(content) : { problem: 'none', confirmed: true, reason: 'The excerpt proves it.' }) }] }) };
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
  assert.equal(r.claims[0].parts.length, 2);
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
  assert.match(r.summary, /1 shown false by the evidence, 1 not established from the sources checked/);
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
  assert.equal(sup.calls.anthropic.filter(x => x.p === '/v1/messages' && /double-check/.test(x.body.messages[0].content)).length, 0, 'no second check for a backed claim');
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
