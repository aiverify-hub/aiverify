# Check Video v3: release test plan

Status: FROZEN on November 22, 2026, before any v3 fresh run. Cary agreed ("Yes, start v3 test").

This is a separately identified evaluation. It reuses the v2 plan (EVAL_PLAN_v2.md) unchanged except where this file says otherwise. The v2 result was NOT ELIGIBLE (gate B failed: Bob found 4 of 5 "shown false" findings were false accusations; gate A: Fred agreed with 80 of 100 firm answers).

## 1. What changed in v3 (commit c2a1146)

| # | Change | v2 cause |
|---|---|---|
| V1 | Relative time words ("yesterday", "right now", "65 years ago") are kept as said, never turned into dates from the upload date. The publication date is only the latest possible recording date. Such a part is false only if it is wrong for every plausible recording date. | 3 of the 4 false accusations |
| V2 | "X said Y" claims are judged on whether X said it, not on whether Y is accurate. | 1 false accusation |
| V3 | Every "shown false" finding gets a separate second check; anything but a clear confirmation (including a failed check) withholds it. | gate B |
| V4 | The extractor lists words to look for on source pages; long paragraphs are split so deep passages can be read; excerpts are larger (10,000 characters) and search copies longer (100,000). | over-caution: Fred found proof for 19 of 30 "not established" claims |

Development check: the 29 fresh-v2 videos behind v2's errors, November 22, $4.63, in the runs folder under dev-v3. Those videos are practice material now and are not release evidence. No code changed after it.

## 2. Videos

- 60 new ordinary videos with the v2 quotas (Health 14, Politics 9, War/world 7, History 5, Money 5, News/disasters 5, Science/space 5, Conspiracy 4, Satire 3, Viral footage 3).
- New search queries, one per quota slot, written before any v3 fresh run and without seeing any system output on them: EVAL_V3_QUERIES.tsv. No query repeats a v1 or v2 topic on purpose.
- Same fixed rule as v2: the first search result with at least 10,000 views, posted within 3 years, and never used in v1, v2 or development.
- A query with no qualifying result is retried once; if it still fails, a backup query for the same category is used and recorded.
- Failed or difficult videos are never replaced. Credit or service outages are rerun on the same video.

## 3. Order of review (changed from v2)

1. Fred: blind sample of 100 firm and 30 "not established" answers, seed 20261123, from at least 30 videos. Shortfalls are reported and make gate A INCONCLUSIVE.
2. Bob: every "shown false" finding (gate B), plus a report-only spot check of 10 seeded claims where Fred and AIVerify agree.
3. Cary grades the 60 videos (gate C) only if gates A and B pass. If either fails, v3 is not eligible and Cary's time is saved for the next round.

## 4. Gates

Unchanged from v2 section 4 (A: at least 90% in the blind firm sample and a whole-video 95% lower bound of at least 80%; B: zero confirmed false accusations and zero unresolved; C: at least 48 of 60 videos YES on all three questions; D: reported only). The bootstrap uses seed 20261121 and 10,000 draws, as in v1 and v2.

## 5. Budget

Cary, November 22, 2026: "spend what you need. Your only limit is $500 a month." Runaway backstop for this test: $40. Expected about $15.

## 6. Freeze record

- Software commit: c2a1146.
- Video list: EVAL_V3_VIDEO_IDS.tsv, 60 videos, SHA-256 9e9be0bc53767b870c3c1531f6ae42117080492d9ae6eb32a8dffd6e1add1436 (LF line endings, as written). All 60 queries found a qualifying video; no backups were used. No system output was seen during selection.
- Fresh run, November 22: 60 videos saved, 58 finished and 2 genuine caption failures; $9.29. Shortfall: only 87 firm answers exist (100 needed), so gate A is INCONCLUSIVE under the frozen rule. Fred still reviews all 87 firm and 30 sampled "not established" answers (seed 20261123), and Bob reviews the 2 "shown false" findings, so accuracy and safety are measured and reported.

## 7. Result (November 22, 2026)

- Gate B (safety): PASS. Bob confirmed both "shown false" findings (autism "much more than 400%": CDC trend is about 381%; Florida map signed May 4, not on the April 29 ruling day). Zero false accusations, zero unresolved.
- Gate A (accuracy): NOT MET and INCONCLUSIVE. Fred agreed with 71 of 87 firm answers (81.6%; 90% needed) and only 87 firm answers existed (100 needed). 12 of the 16 disagreements are AIVerify "backed" where Fred found a material detail wrong (a number, date, place or absolute word); 4 are Fred "not established".
- Over-caution: of 30 sampled "not established" answers, Fred found 11 backed and 6 shown false.
- Gate C: not run (A did not pass), as planned.
- Verdict: NOT ELIGIBLE. The safety fix worked; accuracy did not improve (v2 80%, v3 81.6%). Fred and Bob files are in the runs folder under fresh-v3.
