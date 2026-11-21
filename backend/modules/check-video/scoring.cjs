'use strict';
// Check Video evaluation scoring (grading method I as amended by Bob, Nov 21 2026; rubric v1.1 after Fred's task M).
// Offline only: no network, no paid calls, and nothing here changes how videos are checked.
//
// Input (one evaluation):
//   videos: [{ videoId, group: 'ordinary'|'prophecy', failure?: bool, nonFactual?: bool, centralAnswered: true|false|null,
//              acquisition?: 'ok'|'unavailable'|'failed', completenessReviewed?: bool, missedMainClaims?: int,
//              caption?: { unavailable?: bool, partial?: bool, transcriptionError?: bool } }]
//     centralAnswered null = not graded yet (never counted as a measured pass or fail). A failure video counts as false.
//   claims: [{ videoId, id, app, ref, refLiteral?, literalSame?, explanationValid?, holdReason?, publisher? }]
//     app: 'S' | 'C' | 'M' (misleading) | 'U' | 'FAIL'    (FAIL = missing/crashed output; never firm)
//     ref: 'S' | 'C' | 'U' | 'D'                           (adjudicated reference; D = unresolved dispute)
//     explanationValid: for app C/M against reference C, whether the displayed explanation establishes the material
//       problem. Rubric v1.1: both C and M need an explicit true to count correct; in final mode it must be recorded.
//     refLiteral: the all-literal secondary label. Without it the secondary tally uses ref only if literalSame === true;
//       otherwise that claim is unresolved (D) in the secondary tally and counted as missing.
//     holdReason (app U only): 'acquisition' | 'research' | 'validation' | 'substantive'.
//     publisher: registrable domain of the source behind a firm answer (for publisher concentration).
// Final mode (default) also needs opts.frozen = [{ videoId, group }] and uses the frozen seed and draw count.
// opts.synthetic = true is for tests only: it allows other seeds/draws and no frozen list, and the result says so.
const crypto = require('crypto');

const SEED = 20261121, DRAWS = 10000, ALGO = 'check-video-scoring/1.1 mulberry32 whole-video bootstrap, linear quantile (B-1)p';
const GATES = { accuracyLower: 0.80, accuracyAspiration: 0.85, usefulness: 0.50, undefinedLimit: 0.05, nonFactualReview: 0.10 };
const APP = ['S', 'C', 'M', 'U', 'FAIL'], REF = ['S', 'C', 'U', 'D'], GROUPS = ['ordinary', 'prophecy'];
const HOLD = ['acquisition', 'research', 'validation', 'substantive'];

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
const byId = (a, b) => a.videoId < b.videoId ? -1 : a.videoId > b.videoId ? 1 : 0;

// Refuse to score anything that is not a complete, valid copy of the frozen population (Fred task M defect 2).
function validate(data, opts) {
  const errs = [], videos = data.videos || [], claims = data.claims || [], vids = new Set(), cids = new Set();
  for (const v of videos) {
    if (vids.has(v.videoId)) errs.push('duplicate video ' + v.videoId); vids.add(v.videoId);
    if (!GROUPS.includes(v.group)) errs.push('video ' + v.videoId + ' has unknown group ' + v.group);
    if (![true, false, null, undefined].includes(v.centralAnswered)) errs.push('video ' + v.videoId + ' centralAnswered must be true, false or null');
    if (v.nonFactual && v.centralAnswered === true) errs.push('video ' + v.videoId + ' is non-factual but marked centrally answered');
    if (v.failure && v.centralAnswered === true) errs.push('video ' + v.videoId + ' failed but is marked centrally answered');
  }
  for (const k of claims) {
    if (cids.has(k.id)) errs.push('duplicate claim ' + k.id); cids.add(k.id);
    if (!vids.has(k.videoId)) errs.push('claim ' + k.id + ' names an unknown video ' + k.videoId);
    if (!APP.includes(k.app)) errs.push('claim ' + k.id + ' has invalid app label ' + k.app);
    if (!REF.includes(k.ref)) errs.push('claim ' + k.id + ' has invalid reference label ' + k.ref);
    if (k.refLiteral !== undefined && !REF.includes(k.refLiteral)) errs.push('claim ' + k.id + ' has invalid literal label ' + k.refLiteral);
    if (k.app === 'U' && k.holdReason !== undefined && !HOLD.includes(k.holdReason)) errs.push('claim ' + k.id + ' has invalid hold reason ' + k.holdReason);
    if (!opts.synthetic && (k.app === 'C' || k.app === 'M') && k.ref === 'C' && typeof k.explanationValid !== 'boolean') errs.push('claim ' + k.id + ' needs a reviewed explanationValid');
  }
  if (!opts.synthetic) {
    if (opts.seed !== SEED || opts.draws !== DRAWS) errs.push('final scoring must use seed ' + SEED + ' and ' + DRAWS + ' draws');
    if (!Array.isArray(opts.frozen)) errs.push('final scoring needs the frozen video list');
    else {
      const fz = new Map(opts.frozen.map(f => [f.videoId, f.group]));
      if (fz.size !== opts.frozen.length) errs.push('frozen list has duplicate IDs');
      for (const [id, g] of fz) { const v = videos.find(x => x.videoId === id); if (!v) errs.push('frozen video ' + id + ' is missing'); else if (v.group !== g) errs.push('video ' + id + ' group differs from the frozen list'); }
      for (const v of videos) if (!fz.has(v.videoId)) errs.push('video ' + v.videoId + ' is not in the frozen list');
    }
  }
  if (errs.length) throw Object.assign(new Error('scoring input refused: ' + errs.slice(0, 5).join('; ') + (errs.length > 5 ? ' (+' + (errs.length - 5) + ' more)' : '')), { errors: errs });
}

function literalRef(k) { return k.refLiteral !== undefined ? k.refLiteral : k.literalSame === true ? k.ref : 'D'; }

// Per-video count vector; every ratio is recomputed from summed counts, never averaged.
function videoCounts(v, claims, refOf) {
  const central = v.failure ? false : v.centralAnswered;
  const c = { videos: 1, claimVideos: claims.length ? 1 : 0, firmVideos: 0, failures: v.failure ? 1 : 0, noClaims: claims.length ? 0 : 1,
    nonFactual: v.nonFactual ? 1 : 0, central: central === true ? 1 : 0, centralUngraded: central === true || central === false ? 0 : 1,
    N: 0, F: 0, A: 0, M: 0, Dfirm: 0, D: 0, appFail: 0, explanationFailures: 0, missingLiteral: 0,
    fcRev: 0, fcUnj: 0, appC: 0, fsRev: 0, fsUnj: 0, appS: 0, tooCautious: 0, refFirm: 0,
    hold_acquisition: 0, hold_research: 0, hold_validation: 0, hold_substantive: 0, hold_unknown: 0 };
  for (const k of claims) {
    const ref = refOf(k), side = appSide(k.app), firm = isFirm(k.app);
    if (refOf === literalRef && k.refLiteral === undefined && k.literalSame !== true) c.missingLiteral++;
    c.N++; if (ref === 'D') c.D++; if (k.app === 'FAIL') c.appFail++;
    if (ref === 'S' || ref === 'C') c.refFirm++;
    if (!firm) { if (k.app === 'U' && (ref === 'S' || ref === 'C')) { c.tooCautious++; c['hold_' + (HOLD.includes(k.holdReason) ? k.holdReason : 'unknown')]++; } continue; }
    c.F++;
    if (ref === 'D') { c.Dfirm++; continue; }
    c.A++;
    if (side === 'C' && ref === 'C') { if (k.explanationValid === true) c.M++; else c.explanationFailures++; }
    else if (side === ref) c.M++;
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
    claimCoverage: ratio(t.F, t.N), videoCoverage: ratio(t.firmVideos, t.claimVideos),
    usefulness: ratio(t.central, t.videos), usefulnessUpper: ratio(t.central + t.centralUngraded, t.videos),
    falseContradictionRate: ratio(t.fcRev + t.fcUnj, t.appC), falseSupportRate: ratio(t.fsRev + t.fsUnj, t.appS), tooCautiousRate: ratio(t.tooCautious, t.refFirm),
  };
}
const METRIC_KEYS = Object.keys(metrics(sum([])));

function inputHash(videos, claims) {
  const canon = JSON.stringify({ videos: [...videos].sort(byId), claims: [...claims].sort((a, b) => String(a.id) < String(b.id) ? -1 : 1) });
  return crypto.createHash('sha256').update(canon).digest('hex');
}

// Video-level completeness, caption and publisher diagnostics (Fred task M defect 6). Unknown stays visible as unknown.
function diagnostics(videos, claims) {
  const d = { videos: videos.length, acquisition: { ok: 0, unavailable: 0, failed: 0, unknown: 0 }, completenessReviewed: 0, completenessUnreviewed: 0,
    missedMainClaims: 0, videosWithMissedClaims: 0, caption: { unavailable: 0, partial: 0, transcriptionError: 0, uniqueVideosAffected: 0, unknown: 0 }, publishers: {}, firmWithoutPublisher: 0 };
  for (const v of videos) {
    const a = v.acquisition; d.acquisition[a === 'ok' || a === 'unavailable' || a === 'failed' ? a : 'unknown']++;
    if (v.completenessReviewed === true) { d.completenessReviewed++; const m = Number(v.missedMainClaims) || 0; d.missedMainClaims += m; if (m > 0) d.videosWithMissedClaims++; } else d.completenessUnreviewed++;
    if (!v.caption) d.caption.unknown++;
    else { let hit = false; for (const k of ['unavailable', 'partial', 'transcriptionError']) if (v.caption[k]) { d.caption[k]++; hit = true; } if (hit) d.caption.uniqueVideosAffected++; }
  }
  for (const k of claims) if (isFirm(k.app)) { if (k.publisher) d.publishers[k.publisher] = (d.publishers[k.publisher] || 0) + 1; else d.firmWithoutPublisher++; }
  const firm = Object.values(d.publishers).reduce((a, b) => a + b, 0), top = Object.entries(d.publishers).sort((a, b) => b[1] - a[1]).slice(0, 5);
  d.topPublishers = top.map(([p, n]) => ({ publisher: p, firmAnswers: n, share: ratio(n, firm) }));
  return d;
}

function score(data, opts) {
  opts = Object.assign({ seed: SEED, draws: DRAWS, synthetic: false }, opts || {});
  validate(data, opts);
  const { videos, claims } = data;
  const byVideo = new Map(videos.map(v => [v.videoId, []]));
  for (const k of claims) byVideo.get(k.videoId).push(k);
  const order = [...videos].sort(byId);
  const groups = { ordinary: order.filter(v => v.group === 'ordinary'), prophecy: order.filter(v => v.group === 'prophecy') };
  const tallies = { primary: k => k.ref, literal: literalRef };
  const vec = {}; for (const t in tallies) vec[t] = new Map(order.map(v => [v.videoId, videoCounts(v, byVideo.get(v.videoId), tallies[t])]));

  // Whole-video bootstrap: each replicate draws the ordinary group, then the prophecy group, from one seeded stream.
  // Both tallies use the same drawn videos in every replicate.
  const rand = mulberry32(opts.seed), reps = {};
  for (const t in tallies) reps[t] = { ordinary: [], prophecy: [], all: [] };
  for (let b = 0; b < opts.draws; b++) {
    const picks = {};
    for (const g of GROUPS) { const list = groups[g], p = []; for (let i = 0; i < list.length; i++) p.push(list[Math.floor(rand() * list.length)].videoId); picks[g] = p; }
    for (const t in tallies) {
      const o = sum(picks.ordinary.map(id => vec[t].get(id))), p = sum(picks.prophecy.map(id => vec[t].get(id)));
      reps[t].ordinary.push(metrics(o)); reps[t].prophecy.push(metrics(p)); reps[t].all.push(metrics(sum([o, p])));
    }
  }
  const out = { algorithm: ALGO, seed: opts.seed, draws: opts.draws, mode: opts.synthetic ? 'SYNTHETIC TEST (not a final report)' : 'final', inputHash: inputHash(videos, claims) };
  for (const t in tallies) {
    out[t] = {};
    const totals = { ordinary: sum(groups.ordinary.map(v => vec[t].get(v.videoId))), prophecy: sum(groups.prophecy.map(v => vec[t].get(v.videoId))) };
    totals.all = sum([totals.ordinary, totals.prophecy]);
    for (const g of ['ordinary', 'prophecy', 'all']) {
      const point = metrics(totals[g]), intervals = {};
      for (const m of METRIC_KEYS) {
        const vals = reps[t][g].map(r => r[m]).filter(x => x !== null).sort((a, b) => a - b), undef = opts.draws - vals.length;
        const lo = quantile(vals, 0.025), hi = quantile(vals, 0.975);
        intervals[m] = { lower: lo, upper: hi, undefinedDraws: undef, unreliable: !vals.length || undef / opts.draws > GATES.undefinedLimit, degenerate: vals.length > 0 && lo === hi };
      }
      out[t][g] = { videos: totals[g].videos || 0, counts: totals[g], point, intervals, smallSample: g === 'prophecy' };
    }
  }
  out.literal.complete = out.literal.all.counts.missingLiteral === 0;
  out.diagnostics = { ordinary: diagnostics(groups.ordinary, claims.filter(k => groups.ordinary.some(v => v.videoId === k.videoId))), all: diagnostics(order, claims) };
  out.decision = decide(out.primary.ordinary, opts.review);
  return out;
}

// Statistical gates (method I section 5 + Bob's amendments 1 and 4), kept separate from pilot status (amendment 3).
// review = { dispositions: { claimId: 'text' }, safetyHold: false }; pilot eligibility needs every false contradiction
// dispositioned and an explicit safetyHold === false (no unresolved serious false-allegation, spending or security defect).
function decide(g, review) {
  const reasons = [], acc = g.intervals.accuracy, cons = g.intervals.accuracyDisputesWrong, c = g.counts;
  let accuracy;
  if (c.A === 0 || acc.unreliable || acc.degenerate) { accuracy = 'INCONCLUSIVE'; reasons.push('accuracy interval is missing, unreliable or degenerate'); }
  else if (acc.lower >= GATES.accuracyLower) {
    if (c.Dfirm > 0 && !(cons.lower >= GATES.accuracyLower && !cons.unreliable && !cons.degenerate)) { accuracy = 'INCONCLUSIVE'; reasons.push('unresolved firm disputes could change the accuracy result'); }
    else accuracy = 'PASS';
  } else if (c.Dfirm > 0 && g.intervals.accuracyDisputesRight.lower >= GATES.accuracyLower) { accuracy = 'INCONCLUSIVE'; reasons.push('unresolved firm disputes could change the accuracy result'); }
  else { accuracy = 'FAIL'; reasons.push('accuracy lower bound is below 80%'); }

  let usefulness;
  const lo = g.point.usefulness, hi = g.point.usefulnessUpper;
  if (c.videos && c.nonFactual / c.videos > GATES.nonFactualReview) { usefulness = 'INCONCLUSIVE'; reasons.push('non-factual videos exceed ' + GATES.nonFactualReview * 100 + '% of the ordinary group; Bob decides whether the denominator still fits'); }
  else if (lo !== null && lo >= GATES.usefulness) usefulness = 'PASS';
  else if (hi === null || hi < GATES.usefulness) { usefulness = 'FAIL'; reasons.push('central factual question usefully answered in under 50% of ordinary videos'); }
  else { usefulness = 'INCONCLUSIVE'; reasons.push(c.centralUngraded + ' ordinary videos are not yet graded for the central question'); }

  const statisticalGates = accuracy === 'PASS' && usefulness === 'PASS' ? 'PASSED' : accuracy === 'FAIL' || usefulness === 'FAIL' ? 'FAIL' : 'INCONCLUSIVE';
  const toReview = c.fcRev + c.fcUnj, r = review || {}, done = r.dispositions ? Object.keys(r.dispositions).filter(k => String(r.dispositions[k] || '').trim()).length : 0;
  let pilotStatus;
  if (statisticalGates !== 'PASSED') pilotStatus = 'NOT ELIGIBLE (statistical gates ' + statisticalGates + ')';
  else if (r.safetyHold !== false || done < toReview) pilotStatus = 'GATES PASSED — REVIEW/HOLD STATUS PENDING';
  else pilotStatus = 'ELIGIBLE FOR SCOPED PRIVATE PILOT (not public release)';
  return { accuracy, usefulness, statisticalGates, pilotStatus, reachesAspiration: g.point.accuracy !== null && g.point.accuracy >= GATES.accuracyAspiration,
    falseContradictionsToReview: toReview, dispositionsRecorded: done, explanationFailures: c.explanationFailures, reasons };
}

module.exports = { score, decide, validate, mulberry32, quantile, videoCounts, inputHash, SEED, DRAWS, GATES, ALGO };
