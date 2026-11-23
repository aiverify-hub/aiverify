# Check Video v6: release test plan (short videos)

Status: FROZEN on November 23, 2026, before any v6 video was picked or run. Development decisions are Claude's under Cary's standing approval; the review method below follows Cary's decision of November 23, 2026.

It reuses the v5 plan (EVAL_PLAN_v5.md) except where this file says otherwise.

v5 result: NOT ELIGIBLE. Gate A: Fred agreed with 83 of 100 firm answers; all 17 disagreements were "backed" claims. Gate B: Bob found 1 false accusation and 2 unresolved. These were not adjudicated, because v6 changes the claims themselves. Cary's review of the v5 grading page found no whole-video answer, extra claims that were only evidence for the main claim, and confusing source counts.

## 1. What changed in v6 (commit 4087c30)

| # | Change | v5 cause |
|---|---|---|
| F1 | A headline at the top: the main claim and AIVerify's label for it. It is a finding about that claim only, never about the whole video. | Cary: no plain answer at the top |
| F2 | Cary's rule: "Find the main claim. Find where it came from. Check it there." Other claims must be separate facts, not figures that only support the main claim. The source the video names is kept only if the captions say it; it is searched together with the claim, and the judge treats that source's own page as the deciding record. | protein powder video: 4 claims, 3 of them figures from one report |
| F3 | The "backed" detail check is stricter: an absolute or sweeping word needs the source's own finding (a quote or headline is not enough); a broad group needs a source about that same group; when values conflict, the primary source decides; a status, classification or current count needs a source current at the publish date. | 17 gate A disagreements: absolutes, subgroups, superseded facts, conflicting counts |
| F4 | A "shown false" finding must quote the video's own words for the false part, the quote must be in the captions, and the part may add nothing to those words. | gate B: false parts added a setting or purpose the video never said |
| F5 | The page says "Deciding source" and "All pages read for this claim". | Cary: confusing source counts |

Development check: the 21 v5 videos behind the gate A and B disagreements, November 23, $4.76, in the runs folder under dev-v6 (practice material, not release evidence). Of Fred's 17 wrongly "backed" claims: 8 became "not established", 3 were reworded (no close match), 6 stayed "backed" (all 6 were Fred "not established", not false). Bob's false accusation (the Federal Reserve claim) is gone. All 4 findings Bob confirmed are still "shown false". The two Bob left unresolved (bird flu, aluminum) are still "shown false"; in the bird flu case the full caption shows the video did say "on farms or in other commercial settings".

## 2. Videos

As in v5 section 2, with new queries (EVAL_V6_QUERIES.tsv, written before any v6 run without seeing system output, none repeating a v1 to v5 query) and a never-used-before rule that now also excludes every v5 video. Backups, chosen before the run and used in order only when a query finds no qualifying video: EVAL_V6_QUERIES.tsv rows marked "backup".

## 3. Reviews (Cary, November 23, 2026: AI reviewers check; Cary judges only their disagreements)

Every reviewer file starts with the same text: REVIEWER_RULES.md, with today's date filled in. Grok works in Expert mode.

- Blind sample (gate A): 100 firm and 30 "not established" claims, seed 20261127, chosen as in v2 section 3. Fred and Grok each answer it separately. Fred's answer is the reference, as before. Where Fred and AIVerify disagree, Cary gets that item on its own, with Fred's and Grok's answers and links (not AIVerify's label first), and picks the correct answer. Where Cary does not decide, the item counts against AIVerify.
- "Shown false" safety (gate B): every "shown false" finding. Bob and Grok each review it separately. A finding passes when Bob confirms it. When Bob calls it a false accusation or unresolved, Cary gets it on its own with both reviews and decides; if he does not decide, it fails gate B.
- Main claim (gate C, replacing Cary's 3-question grading): for every video that produced claims, Bob reads the video's full captions and answers two questions: does the main claim say what the video says (yes/no), and is it the video's main point (yes/no)? Pass: at least 90% yes on both. Cary judges only the "no" answers he wants to see. Failed caption reads and videos with no claims are reported, not graded.
- Gate D is reported only, as before (coverage, "not established" share, caption failures, timing, cost).

## 4. Gates

A and B as in v2 section 4. C as in section 3 above. All three must pass.

## 5. Budget

Within Cary's $500 a month. Runaway backstop for this test: $50. Expected about $25 (v6 development cost about $0.23 a video).

## 6. Freeze record

- Software commit: 4087c30.
- Queries: EVAL_V6_QUERIES.tsv (100 queries plus 10 backups).
- Video list: EVAL_V6_VIDEO_IDS.tsv, recorded below after picking and before any run.
- Video list: EVAL_V6_VIDEO_IDS.tsv, 100 videos (74 Shorts, 26 regular), SHA-256 64b882a5c6cdae822ec5bfdeec1994f8066970bdcb19be33ca3f63186100910f (LF line endings, as written). Three queries found no qualifying video (hepatitis outbreak, federal hiring freeze, russia ukraine frontline); the backups for those categories were used: zinc cold study, tax cut claims, ukraine energy strikes. No system output was seen during selection.
