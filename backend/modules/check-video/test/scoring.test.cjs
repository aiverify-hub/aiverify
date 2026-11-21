'use strict';
// Synthetic-only checks of the scoring arithmetic (Bob, Nov 21: no real results, no paid calls, no rubric tuning).
const test = require('node:test'), assert = require('node:assert');
const S = require('../scoring.cjs');

function synth(nVideos, claimFn, videoFn) {
  const videos = [], claims = [];
  for (let i = 0; i < nVideos; i++) {
    const id = 'v' + String(i).padStart(3, '0');
    videos.push(Object.assign({ videoId: id, group: 'ordinary', centralAnswered: true }, videoFn ? videoFn(i) : {}));
    (claimFn(i) || []).forEach((c, j) => claims.push(Object.assign({ videoId: id, id: id + '-c' + j }, c)));
  }
  return { videos, claims };
}

test('mulberry32 is deterministic for the frozen seed', () => {
  const a = S.mulberry32(S.SEED), b = S.mulberry32(S.SEED);
  for (let i = 0; i < 5; i++) { const x = a(); assert.strictEqual(x, b()); assert.ok(x >= 0 && x < 1); }
  assert.notStrictEqual(S.mulberry32(S.SEED)(), S.mulberry32(S.SEED + 1)());
});

test('linear quantile at (B-1)p', () => {
  assert.strictEqual(S.quantile([0, 10], 0.25), 2.5);
  assert.strictEqual(S.quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.strictEqual(S.quantile([], 0.5), null);
});

test('mechanical counts: firm, accuracy, coverage, false contradictions, too cautious, disputes', () => {
  const data = { videos: [{ videoId: 'a', group: 'ordinary', centralAnswered: true }, { videoId: 'b', group: 'ordinary', centralAnswered: false }, { videoId: 'c', group: 'ordinary', failure: true }], claims: [
    { videoId: 'a', id: 'a1', app: 'S', ref: 'S' }, { videoId: 'a', id: 'a2', app: 'C', ref: 'S' }, { videoId: 'a', id: 'a3', app: 'U', ref: 'C', holdReason: 'research' },
    { videoId: 'b', id: 'b1', app: 'S', ref: 'U' }, { videoId: 'b', id: 'b2', app: 'S', ref: 'D' }, { videoId: 'b', id: 'b3', app: 'FAIL', ref: 'S' } ] };
  const r = S.score(data, { draws: 200, synthetic: true }), c = r.primary.ordinary.counts, p = r.primary.ordinary.point;
  assert.deepStrictEqual([c.N, c.F, c.A, c.M, c.Dfirm], [6, 4, 3, 1, 1]);
  assert.strictEqual(p.accuracy, 1 / 3);                       // S/U counts wrong (unsupported conclusion)
  assert.strictEqual(p.accuracyDisputesWrong, 1 / 4); assert.strictEqual(p.accuracyDisputesRight, 2 / 4);
  assert.strictEqual(p.claimCoverage, 4 / 6);
  assert.strictEqual(p.videoCoverage, 2 / 2);                  // failed video c has no claims, so it is not claim-bearing
  assert.strictEqual(p.usefulness, 1 / 3);                     // failures stay in the denominator
  assert.deepStrictEqual([c.fcRev, c.fcUnj, c.appC], [1, 0, 1]);
  assert.deepStrictEqual([c.fsRev, c.fsUnj, c.appS], [0, 1, 2]);
  assert.deepStrictEqual([c.tooCautious, c.hold_research, c.refFirm, c.appFail], [1, 1, 4, 1]);
});

test('misleading earns a correct C only with a valid explanation; C loses it when explanation is invalid', () => {
  const mk = (app, ev) => ({ videos: [{ videoId: 'a', group: 'ordinary' }], claims: [{ videoId: 'a', id: 'x', app, ref: 'C', explanationValid: ev }] });
  const acc = d => S.score(d, { draws: 10, synthetic: true }).primary.ordinary.point.accuracy;
  assert.strictEqual(acc(mk('M', true)), 1); assert.strictEqual(acc(mk('M', undefined)), 0);
  // Rubric v1.1 (Fred task M defect 4): contradicted also needs an explicit reviewed true.
  assert.strictEqual(acc(mk('C', true)), 1); assert.strictEqual(acc(mk('C', undefined)), 0); assert.strictEqual(acc(mk('C', false)), 0);
  assert.strictEqual(S.score(mk('C', false), { draws: 10, synthetic: true }).decision.explanationFailures, 1);
});

test('bootstrap resamples whole videos, so correlated claims widen the interval', () => {
  // Same 90% claim accuracy two ways: errors spread thinly vs. concentrated in whole videos.
  const spread = synth(40, i => Array.from({ length: 10 }, (_, j) => ({ app: 'S', ref: j === 0 ? 'C' : 'S' })));
  const clustered = synth(40, i => Array.from({ length: 10 }, () => ({ app: 'S', ref: i < 4 ? 'C' : 'S' })));
  const w = d => { const iv = S.score(d, { draws: 2000, synthetic: true }).primary.ordinary.intervals.accuracy; return iv.upper - iv.lower; };
  assert.ok(w(spread) < 1e-9, 'one error per video: every resample is exactly 90%');
  assert.ok(w(clustered) > 0.1, 'errors packed in 4 videos: wide interval');
});

test('all-correct sample is degenerate and cannot pass', () => {
  const r = S.score(synth(30, () => [{ app: 'S', ref: 'S' }]), { draws: 500, synthetic: true });
  assert.strictEqual(r.primary.ordinary.point.accuracy, 1);
  assert.ok(r.primary.ordinary.intervals.accuracy.degenerate);
  assert.strictEqual(r.decision.accuracy, 'INCONCLUSIVE');
});

test('more than 5% undefined draws marks the interval unreliable', () => {
  // Only 2 of 30 videos have a firm answer, so many resamples contain none.
  const r = S.score(synth(30, i => [i < 2 ? { app: 'S', ref: 'S' } : { app: 'U', ref: 'U' }]), { draws: 1000, synthetic: true });
  const iv = r.primary.ordinary.intervals.accuracy;
  assert.ok(iv.undefinedDraws > 50 && iv.unreliable);
  assert.strictEqual(r.decision.accuracy, 'INCONCLUSIVE');
});

test('clear pass, clear fail, and disputes that could flip the result', () => {
  const pass = S.score(synth(60, i => [{ app: 'S', ref: i % 20 === 0 ? 'C' : 'S' }, { app: 'S', ref: 'S' }]), { draws: 2000, synthetic: true });
  assert.strictEqual(pass.decision.accuracy, 'PASS'); assert.strictEqual(pass.decision.statisticalGates, 'PASSED');
  assert.strictEqual(pass.decision.pilotStatus, 'GATES PASSED — REVIEW/HOLD STATUS PENDING');
  const fail = S.score(synth(60, i => [{ app: 'S', ref: i % 3 === 0 ? 'C' : 'S' }]), { draws: 2000, synthetic: true });
  assert.strictEqual(fail.decision.accuracy, 'FAIL');
  // A few disputes that cannot flip the result still pass (conservative bound >= 80%) ...
  const fewDisputes = S.score(synth(60, i => [{ app: 'S', ref: i % 20 === 0 ? 'C' : 'S' }, { app: 'S', ref: i < 12 ? 'D' : 'S' }]), { draws: 2000, synthetic: true });
  assert.strictEqual(fewDisputes.decision.accuracy, 'PASS');
  // ... but many unresolved firm disputes could, so the result is inconclusive.
  const disputed = S.score(synth(60, i => [{ app: 'S', ref: i % 20 === 0 ? 'C' : 'S' }, { app: 'S', ref: i < 30 ? 'D' : 'S' }]), { draws: 2000, synthetic: true });
  assert.strictEqual(disputed.decision.accuracy, 'INCONCLUSIVE');
});

test('usefulness gate: under 50% fails; too many non-factual videos is inconclusive', () => {
  const low = S.score(synth(40, i => [{ app: 'S', ref: i % 20 === 0 ? 'C' : 'S' }, { app: 'S', ref: 'S' }], i => ({ centralAnswered: i < 15 })), { draws: 1000, synthetic: true });
  assert.strictEqual(low.decision.usefulness, 'FAIL'); assert.strictEqual(low.decision.statisticalGates, 'FAIL');
  const nf = S.score(synth(40, () => [{ app: 'S', ref: 'S' }], i => ({ nonFactual: i < 6, centralAnswered: i >= 6 })), { draws: 200, synthetic: true });
  assert.strictEqual(nf.decision.usefulness, 'INCONCLUSIVE');
});

test('prophecy group is scored separately and does not set the ordinary gate', () => {
  const d = synth(40, i => [{ app: 'S', ref: i % 20 === 0 ? 'C' : 'S' }, { app: 'S', ref: 'S' }]);
  ['p1', 'p2', 'p3', 'p4'].forEach(id => { d.videos.push({ videoId: id, group: 'prophecy', centralAnswered: false }); d.claims.push({ videoId: id, id: id + 'c', app: 'C', ref: 'S' }); });
  const r = S.score(d, { draws: 1000, synthetic: true });
  assert.strictEqual(r.primary.prophecy.videos, 4); assert.strictEqual(r.primary.prophecy.point.accuracy, 0); assert.ok(r.primary.prophecy.smallSample);
  assert.strictEqual(r.primary.all.videos, 44);
  assert.strictEqual(r.decision.accuracy, S.score({ videos: d.videos.slice(0, 40), claims: d.claims.filter(c => !/^p/.test(c.videoId)) }, { draws: 1000, synthetic: true }).decision.accuracy);
});

test('same input gives the same hash and intervals; refLiteral secondary tally differs', () => {
  const d = synth(20, i => [{ app: 'S', ref: 'S', refLiteral: i < 5 ? 'C' : 'S' }, { app: 'S', ref: i < 3 ? 'C' : 'S' }]);
  const a = S.score(d, { draws: 500, synthetic: true }), b = S.score(d, { draws: 500, synthetic: true });
  assert.strictEqual(a.inputHash, b.inputHash); assert.deepStrictEqual(a.primary.ordinary.intervals, b.primary.ordinary.intervals);
  // Both tallies come out of one run. The second claim has no literal label and no literalSame, so it is missing there.
  assert.strictEqual(a.literal.all.counts.missingLiteral, 20); assert.strictEqual(a.literal.complete, false);
  assert.strictEqual(a.literal.ordinary.counts.Dfirm, 20);
  assert.ok(a.literal.ordinary.point.accuracy < 1);
  const same = synth(20, () => [{ app: 'S', ref: 'S', literalSame: true }]);
  assert.strictEqual(S.score(same, { draws: 50, synthetic: true }).literal.complete, true);
  assert.throws(() => S.score({ videos: [], claims: [{ videoId: 'zz', id: 'x', app: 'S', ref: 'S' }] }, { synthetic: true }), /unknown video/);
});

test('invalid or incomplete input is refused (Fred task M defect 2)', () => {
  const ok = synth(3, () => [{ app: 'S', ref: 'S' }]), syn = { draws: 10, synthetic: true };
  const bad = f => { const d = JSON.parse(JSON.stringify(ok)); f(d); return () => S.score(d, syn); };
  assert.throws(bad(d => d.videos.push(Object.assign({}, d.videos[0]))), /duplicate video/);
  assert.throws(bad(d => d.claims.push(Object.assign({}, d.claims[0]))), /duplicate claim/);
  assert.throws(bad(d => { d.videos[0].group = 'Ordinary'; }), /unknown group/);
  assert.throws(bad(d => { d.claims[0].ref = 'X'; }), /invalid reference label/);
  assert.throws(bad(d => { d.claims[0].app = 'supported'; }), /invalid app label/);
  assert.throws(bad(d => { d.videos[0].nonFactual = true; }), /non-factual but marked centrally answered/);
  assert.throws(bad(d => { d.videos[0].failure = true; }), /failed but is marked centrally answered/);
  // Final mode: frozen list, frozen seed/draws and reviewed explanations are all required.
  const frozen = ok.videos.map(v => ({ videoId: v.videoId, group: v.group }));
  assert.throws(() => S.score(ok), /frozen video list/);
  assert.throws(() => S.score(ok, { frozen, draws: 500 }), /seed 20261121 and 10000 draws/);
  assert.throws(() => S.score(ok, { frozen: frozen.slice(1) }), /not in the frozen list/);
  assert.throws(() => S.score({ videos: ok.videos.slice(1), claims: ok.claims.slice(1) }, { frozen }), /frozen video v000 is missing/);
  const c = JSON.parse(JSON.stringify(ok)); c.claims[0].app = 'C'; c.claims[0].ref = 'C';
  assert.throws(() => S.score(c, { frozen }), /needs a reviewed explanationValid/);
  const r = S.score(ok, { frozen }); assert.strictEqual(r.mode, 'final'); assert.strictEqual(r.draws, 10000);
});

test('ungraded central questions are not a measured fail; failures count as not answered (defect 3)', () => {
  const half = synth(40, i => [{ app: 'S', ref: i % 20 === 0 ? 'C' : 'S' }, { app: 'S', ref: 'S' }], i => ({ centralAnswered: i < 15 ? true : i < 30 ? null : false }));
  const r = S.score(half, { draws: 500, synthetic: true });
  assert.strictEqual(r.primary.ordinary.point.usefulness, 15 / 40); assert.strictEqual(r.primary.ordinary.point.usefulnessUpper, 30 / 40);
  assert.strictEqual(r.decision.usefulness, 'INCONCLUSIVE');
  const failed = synth(4, () => [], i => ({ failure: i === 0, centralAnswered: i === 0 ? null : true }));
  assert.strictEqual(S.score(failed, { draws: 50, synthetic: true }).primary.ordinary.counts.centralUngraded, 0);
});

test('pilot status needs every false contradiction dispositioned and an explicit no-HOLD (defect 1)', () => {
  const d = synth(60, i => [{ app: 'S', ref: i % 20 === 0 ? 'C' : 'S' }, { app: 'S', ref: 'S' }]);
  d.claims.push({ videoId: 'v001', id: 'fc', app: 'C', ref: 'S' });
  const syn = { draws: 2000, synthetic: true };
  assert.strictEqual(S.score(d, syn).decision.statisticalGates, 'PASSED');
  assert.strictEqual(S.score(d, syn).decision.pilotStatus, 'GATES PASSED — REVIEW/HOLD STATUS PENDING');
  assert.strictEqual(S.score(d, Object.assign({ review: { safetyHold: false, dispositions: {} } }, syn)).decision.pilotStatus, 'GATES PASSED — REVIEW/HOLD STATUS PENDING');
  assert.strictEqual(S.score(d, Object.assign({ review: { safetyHold: true, dispositions: { fc: 'fixed' } } }, syn)).decision.pilotStatus, 'GATES PASSED — REVIEW/HOLD STATUS PENDING');
  assert.strictEqual(S.score(d, Object.assign({ review: { safetyHold: false, dispositions: { fc: 'source misread; fixed and retested on fresh cases' } } }, syn)).decision.pilotStatus, 'ELIGIBLE FOR SCOPED PRIVATE PILOT (not public release)');
});

test('diagnostics keep unknowns visible (defect 6)', () => {
  const d = synth(4, () => [{ app: 'S', ref: 'S', publisher: 'cdc.gov' }], i => i === 0 ? { acquisition: 'ok', completenessReviewed: true, missedMainClaims: 2, caption: { partial: true, transcriptionError: true } } : {});
  const g = S.score(d, { draws: 20, synthetic: true }).diagnostics.ordinary;
  assert.deepStrictEqual(g.acquisition, { ok: 1, unavailable: 0, failed: 0, unknown: 3 });
  assert.deepStrictEqual([g.completenessReviewed, g.completenessUnreviewed, g.missedMainClaims, g.videosWithMissedClaims], [1, 3, 2, 1]);
  assert.deepStrictEqual([g.caption.partial, g.caption.transcriptionError, g.caption.uniqueVideosAffected, g.caption.unknown], [1, 1, 1, 3]);
  assert.deepStrictEqual(g.topPublishers, [{ publisher: 'cdc.gov', firmAnswers: 4, share: 1 }]);
});
