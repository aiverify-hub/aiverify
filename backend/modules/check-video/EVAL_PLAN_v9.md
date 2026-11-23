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
- Run note: at Cary's request the whole run goes on November 23 instead of splitting at midnight; the local daily backstop was raised from $100 to $150 for that (commit 25c1f47, which allows up to $200). This changes no check. Three videos ran before the restart and are kept.

## Beta pass marks (Cary, November 23, 2026, set before any v9 review or score)

Cary: "No answers in an acceptable amount is much better than any wrong answers." A labeled beta (a "Beta" tag on the page and a way for users to flag answers) may be considered when: gate B has zero false accusations (no exceptions); gate A is at least 85%; gates C and D are at least 80% each. Full release keeps the 90% marks. Going live still needs Cary's go-ahead.

## Run record (November 23, 2026)

- All 98 videos, software 7d383ad, $22.82 (about $0.23 a video). 95 readable; 14 declined by the scope rule; 81 checked; no search errors; none stopped early.
- 319 claims: backed 76, shown false 7, not established 236 (74%). 130 were claims about what the Scriptures say (backed 31, shown false 3, not established 96). Main claims: backed 5, shown false 2, not established 72, list videos 2. Supporting Scriptures on 55 of 81 checked videos.
- 83 firm claims (100 required), so gate A is INCONCLUSIVE; Fred reviews all 83 plus 30 "not established" (seed 20261130).
- Review files built: FRED_V9_BLIND (113 claims), BOB_V9_1_SCOPE (95 videos, blind), BOB_V9_2_SHOWN_FALSE (7), BOB_V9_3_MAIN_CLAIM (81 videos, with the Supporting Scriptures relevance question).
- Alignment (November 23, 2026, before any v9 review): Bob proposed four changes to rule 12 and the Supporting Scriptures task; Cary left it to Claude; all adopted except that the page keeps the word "Scriptures" (Cary's rule) while reviewers are told the source and translation. Rule 12 now: a paraphrase must keep the passage's meaning in context; a claim is shown false only by the passage it quotes or names; verdicts that depend on translator-supplied or disputed wording stay "not established". Bob's Supporting Scriptures question also asks whether the selection misleadingly implies support or opposition, and allows "unresolved". The v9 software ran under the earlier, looser wording of rule 12, so any difference counts against AIVerify. The same change is in the software for the next version.
- Fred's alignment (same day, before any review): his rule 12 points overlap Bob's; also adopted: check against the named book only, fidelity covers speaker, subject, negation and conditions, a wrong quotation or attribution is shown false, and Bob flags passages that oppose or merely report a teaching. His proposal to rename the section "Related Scriptures" is Cary's decision. Review files rebuilt with these rules.
