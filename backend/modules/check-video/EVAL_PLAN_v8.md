# Check Video v8: release test plan (videos of 3 to 20 minutes)

Status: FROZEN on November 23, 2026, before any v8 video was picked or run.

v8 is the v7 software (EVAL_PLAN_v7.md, section 1) plus one product rule from Cary: videos under 3 minutes are declined before any paid model call (commit 7ea5849). Everything in the v7 plan applies except as stated here. Fred and Bob agreed to the rules and tasks in the v7 alignment round; the tasks are unchanged.

## 1. Videos

- 100 videos, 3 to 20 minutes long, chosen by the v5 rule with that length (first regular video in page order with at least 10,000 views, posted on or after November 22, 2023, not live, never used before).
- Queries: the frozen v7 queries (EVAL_V7_QUERIES.tsv, including backups in the same order). They were written before any v7 run; only 7 short videos were run on them, and their outputs were not reviewed.
- Failed or difficult videos are never replaced. Empty slots stay empty.

## 2. Reviews and gates

As in v7 section 3 (gates A to D, seed 20261129 for the blind sample). For gate C, Bob gets each video's captions up to 2,500 words (the first 2,000 and the last 500 words of longer captions), plus the video link.

## 3. Budget

Within Cary's $500 a month. Runaway backstop $50. Expected about $25.

## 4. Freeze record

- Software commit: 9d7f504 (7ea5849 plus, before any v8 run, a per-check spending cap of $1.50 instead of $0.60 and a 230-second deadline instead of 170, because the second judge's up-front reservation stopped 3 development checks early).
- Video list: EVAL_V8_VIDEO_IDS.tsv, 86 videos (71 in the scope groups, 15 harmless; 3 to 19.6 minutes, median 10.9 minutes), SHA-256 349c2ba6437f302d452d3494b8ce9d5336a6323a80e3280b091f3310c37a029f (LF line endings, as written). Twenty queries found no qualifying regular video (for many, the first results were Shorts or longer than 20 minutes); one backup per group refilled 6 of them (the Prophecy backup was not needed). Fourteen slots stay empty: Health 7, Morality 3, Faith 2, Origins 1, Harmless 1. If fewer than 100 firm claims result, gate A is INCONCLUSIVE, as the v2 plan requires. No system output was seen during selection.
