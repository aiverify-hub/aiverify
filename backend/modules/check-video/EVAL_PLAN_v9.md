# Check Video v9: release test plan (videos of 3 to 20 minutes, scripture checking)

Status: FROZEN on November 23, 2026, before any v9 video was picked or run.

v9 is the v8 software (EVAL_PLAN_v8.md) plus scripture checking (Cary, November 23, 2026: "why are we looking to web sources rather than ... the two scripture sources?"):

| # | Change |
|---|---|
| H1 | A claim about what the Scriptures say is checked against local text only (no web search): KJV 1769, 66 books first (tier 1), then its Apocrypha and 1 Enoch (R. H. Charles 1917) (tier 2). Passages come from the references the video cites or the claim is about, then a phrase search. Commits b907ac2, 7d383ad. |
| H2 | Words the translators added ([brackets] in the text, italics in the KJV) never decide "shown false". Commit 12bbf9e. |
| H3 | A teaching the video presents gets "Supporting Scriptures to Consider and Share": related passages as text only, never interpreted or labeled (Cary). |

Development check (practice only): the 38 v8 Faith, Prophecy and Morality videos, $11.97, under dev-v9 (run on b907ac2, before H2 and Enoch). Main claims with a firm answer: 4 (v8) to 10. 29 claims about what the Scriptures say: 6 backed, 2 shown false, 21 not established (mostly interpretations the text does not state). Supporting Scriptures on 25 of 38 videos. One shown-false finding rested on words the translators added (2 Samuel 21:19), which led to H2.

## Videos

100 videos of 3 to 20 minutes by the v8 rule, from new queries (EVAL_V9_QUERIES.tsv, written before any v9 run, none repeating an earlier query): Faith 30, Health 20, Prophecy 10, Morality 10, Origins 8, Money 7, and 15 harmless queries. One backup per group, used in order only when a query finds no qualifying video. Empty slots stay empty.

## Reviews and gates

As in v7 section 3 (gates A to D), with reviewer rule 12 (REVIEWER_RULES.md, commit 670558f) and one added report-only task: Bob says whether each Supporting Scripture passage relates to the teaching it is shown under. Fred and Bob confirm the rule change first (ALIGN_V9.txt). Blind-sample seed 20261130. If fewer than 100 firm claims exist, gate A is INCONCLUSIVE and Fred reviews all of them.

## Budget

Within Cary's $500 a month (November so far: about $180). Runaway backstop $50. Expected about $30.

## Freeze record

- Software commit: 7d383ad (scripture checking) with reviewer rules at 670558f.
- Video list: EVAL_V9_VIDEO_IDS.tsv, 98 videos (84 in the scope groups, 14 harmless), SHA-256 25254c133c7b20e95685c90851de7063ac188ecc678caa6e7ee4ea8a84f62792 (LF line endings, as written). Seven queries found no qualifying regular video; backups refilled Faith, Health (one of two), Morality, Origins and Money; the Harmless backup also found none and the Prophecy backup was not needed. Two slots stay empty (Health 1, Harmless 1). No system output was seen during selection.
