'use strict';
// Check Video evaluation scoring (grading method I as amended by Bob, Nov 21 2026). Offline only:
// no network, no paid calls, and nothing here changes how videos are checked.
//
// Input (one evaluation):
//   videos: [{ videoId, group: 'ordinary'|'prophecy', failure?: bool, nonFactual?: bool, centralAnswered?: bool|null }]
//   claims: [{ videoId, id, app, ref, refLiteral?, explanationValid?, holdReason? }]
//     app: 'S' | 'C' | 'M' (misleading) | 'U' | 'FAIL'    (FAIL = missing/crashed output; never firm)
//     ref: 'S' | 'C' | 'U' | 'D'                           (adjudicated reference; D = unresolved dispute)
//     explanationValid: for app C/M, whether the displayed explanation establishes the material problem.
//       A misleading label earns a correct C only when this is true; a contradicted label loses it when this is false.
//     refLiteral: the all-literal secondary label (falls back to ref).
//     holdReason (app U only): 'acquisition' | 'research' | 'validation' | 'substantive'.
const crypto = require('crypto');

const SEED = 20261121, DRAWS = 10000, ALGO = 'check-video-scoring/1 mulberry32 whole-video bootstrap, linear quantile (B-1)p';
const GATES = { accuracyLower: 0.80, accuracyAspiration: 0.85, usefulness: 0.50, undefinedLimit: 0.05, nonFactualReview: 0.10 };

function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function quantile(sorted, p) {
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}
const ratio = (n, d) => d > 0 ? n / d : null;
const isFirm = a => a === 'S' || a === 'C' || a === 'M';
const appSide = a => a === 'M' ? 'C' : a;

// Per-video count vector; every ratio is recomputed from summed counts, never averaged.
function videoCounts(v, claims, refKey) {
  const c = { videos: 1, claimVideos: claims.length ? 1 : 0, firmVideos: 0, failures: v.failure ? 1 : 0, noClaims: claims.length ? 0 : 1,
    nonFactual: v.nonFactual ? 1 : 0, central: v.centralAnswered === true ? 1 : 0,
    N: 0, F: 0, A: 0, M: 0, Dfirm: 0, D: 0, appFail: 0,
    fcRev: 0, fcUnj: 0, appC: 0, fsRev: 0, fsUnj: 0, appS: 0, tooCautious: 0, refFirm: 0,
    hold_acquisition: 0, hold_research: 0, hold_validation: 0, hold_substantive: 0, hold_unknown: 0 };
  for (const k of claims) {
    const ref = refKey === 'refLiteral' && k.refLiteral ? k.refLiteral : k.ref, side = appSide(k.app), firm = isFirm(k.app);
    c.N++; if (ref === 'D') c.D++; if (k.app === 'FAIL') c.appFail++;
    if (ref === 'S' || ref === 'C') c.refFirm++;
    if (!firm) { if (k.app === 'U' && (ref === 'S' || ref === 'C')) { c.tooCautious++; const h = 'hold_' + (k.holdReason || 'unknown'); c[h in c ? h : 'hold_unknown']++; } continue; }
    c.F++;
    if (ref === 'D') { c.Dfirm++; continue; }
    c.A++;
    const explained = k.app === 'M' ? k.explanationValid === true : k.app === 'C' ? k.explanationValid !== false : true;
    if (side === ref && explained) c.M++;
    if (side === 'C') { c.appC++; if (ref === 'S') c.fcRev++; else if (ref === 'U') c.fcUnj++; }
    if (side === 'S') { c.appS++; if (ref === 'C') c.fsRev++; else if (ref === 'U') c.fsUnj++; }
  }
  if (c.F) c.firmVideos = 1;
  return c;
}
function sum(vectors) { const t = {}; for (const v of vectors) for (const k in v) t[k] = (t[k] || 0) + v[k]; return t; }
function metrics(t) {
  return {
    accuracy: ratio(t.M, t.A), accuracyDisputesWrong: ratio(t.M, t.A + t.Dfirm), accuracyDisputesRight: ratio(t.M + t.Dfirm, t.A + t.Dfirm),
    claimCoverage: ratio(t.F, t.N), videoCoverage: ratio(t.firmVideos, t.claimVideos), usefulness: ratio(t.central, t.videos),
    falseContradictionRate: ratio(t.fcRev + t.fcUnj, t.appC), falseSupportRate: ratio(t.fsRev + t.fsUnj, t.appS), tooCautiousRate: ratio(t.tooCautious, t.refFirm),
  };
}
const METRIC_KEYS = Object.keys(metrics(sum([])));

function inputHash(videos, claims) {
  const canon = JSON.stringify({ videos: [...videos].sort((a, b) => a.videoId < b.videoId ? -1 : a.videoId > b.videoId ? 1 : 0), claims: [...claims].sort((a, b) => String(a.id) < String(b.id) ? -1 : 1) });
  return crypto.createHash('sha256').update(canon).digest('hex');
}

function score({ videos, claims }, opts) {
  opts = Object.assign({ seed: SEED, draws: DRAWS, refKey: 'ref' }, opts || {});
  const byVideo = new Map(videos.map(v => [v.videoId, []]));
  for (const k of claims) { if (!byVideo.has(k.videoId)) throw new Error('claim ' + k.id + ' names an unknown video ' + k.videoId); byVideo.get(k.videoId).push(k); }
  const order = [...videos].sort((a, b) => a.videoId < b.videoId ? -1 : a.videoId > b.videoId ? 1 : 0);
  const groups = { ordinary: order.filter(v => v.group !== 'prophecy'), prophecy: order.filter(v => v.group === 'prophecy') };
  const vec = new Map(order.map(v => [v.videoId, videoCounts(v, byVideo.get(v.videoId), opts.refKey)]));
  const totals = { ordinary: sum(groups.ordinary.map(v => vec.get(v.videoId))), prophecy: sum(groups.prophecy.map(v => vec.get(v.videoId))) };
  totals.all = sum([totals.ordinary, totals.prophecy]);

  // Whole-video bootstrap: each replicate draws the ordinary group, then the prophecy group, from one seeded stream.
  const rand = mulberry32(opts.seed), reps = { ordinary: [], prophecy: [], all: [] };
  for (let b = 0; b < opts.draws; b++) {
    const draw = {};
    for (const g of ['ordinary', 'prophecy']) { const list = groups[g], picked = []; for (let i = 0; i < list.length; i++) picked.push(vec.get(list[Math.floor(rand() * list.length)].videoId)); draw[g] = sum(picked); }
    reps.ordinary.push(metrics(draw.ordinary)); reps.prophecy.push(metrics(draw.prophecy)); reps.all.push(metrics(sum([draw.ordinary, draw.prophecy])));
  }
  const out = { algorithm: ALGO, seed: opts.seed, draws: opts.draws, refKey: opts.refKey, inputHash: inputHash(videos, claims), groups: {} };
  for (const g of ['ordinary', 'prophecy', 'all']) {
    const point = metrics(totals[g]), intervals = {};
    for (const m of METRIC_KEYS) {
      const vals = reps[g].map(r => r[m]).filter(x => x !== null).sort((a, b) => a - b), undef = opts.draws - vals.length;
      const lo = quantile(vals, 0.025), hi = quantile(vals, 0.975);
      intervals[m] = { lower: lo, upper: hi, undefinedDraws: undef, unreliable: !vals.length || undef / opts.draws > GATES.undefinedLimit, degenerate: vals.length > 0 && lo === hi };
    }
    out.groups[g] = { videos: totals[g].videos, counts: totals[g], point, intervals, smallSample: g === 'prophecy' };
  }
  out.decision = decide(out.groups.ordinary);
  return out;
}

// Pass rule (method I section 5 + Bob's amendments 1, 3, 4). Passing means "eligible for a scoped private pilot" only.
function decide(g) {
  const reasons = [], acc = g.intervals.accuracy, cons = g.intervals.accuracyDisputesWrong, c = g.counts;
  let accuracy;
  if (c.A === 0 || acc.unreliable || acc.degenerate) { accuracy = 'INCONCLUSIVE'; reasons.push('accuracy interval is missing, unreliable or degenerate'); }
  else if (acc.lower >= GATES.accuracyLower) {
    if (c.Dfirm > 0 && !(cons.lower >= GATES.accuracyLower && !cons.unreliable && !cons.degenerate)) { accuracy = 'INCONCLUSIVE'; reasons.push('unresolved firm disputes could change the accuracy result'); }
    else accuracy = 'PASS';
  } else if (c.Dfirm > 0 && g.intervals.accuracyDisputesRight.lower >= GATES.accuracyLower) { accuracy = 'INCONCLUSIVE'; reasons.push('unresolved firm disputes could change the accuracy result'); }
  else { accuracy = 'FAIL'; reasons.push('accuracy lower bound is below 80%'); }
  let usefulness = g.point.usefulness !== null && g.point.usefulness >= GATES.usefulness ? 'PASS' : 'FAIL';
  if (c.videos && c.nonFactual / c.videos > GATES.nonFactualReview) { usefulness = 'INCONCLUSIVE'; reasons.push('non-factual videos exceed ' + GATES.nonFactualReview * 100 + '% of the ordinary group; Bob decides whether the denominator still fits'); }
  else if (usefulness === 'FAIL') reasons.push('central factual question usefully answered in under 50% of ordinary videos');
  const overall = accuracy === 'PASS' && usefulness === 'PASS' ? 'ELIGIBLE FOR SCOPED PRIVATE PILOT (not public release)' : accuracy === 'FAIL' || usefulness === 'FAIL' ? 'FAIL' : 'INCONCLUSIVE';
  return { accuracy, usefulness, overall, reachesAspiration: g.point.accuracy !== null && g.point.accuracy >= GATES.accuracyAspiration, falseContradictionsToReview: c.fcRev + c.fcUnj, reasons };
}

module.exports = { score, decide, mulberry32, quantile, videoCounts, inputHash, SEED, DRAWS, GATES, ALGO };
