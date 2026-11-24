# Check Video v10: final beta test (videos of 3 to 20 minutes)

Status: FROZEN on November 23, 2026, before any v10 final-test video was picked or run. No hand-picking: the first-result rule of the v8 plan, with backups used only when a query finds no qualifying video.

Software: commit e93ad8f (v10 beta build; changes and tuning results in TUNING_LOG_v10.md). Beta mode: claims about what the Scriptures say get firm answers; web-checked factual claims list their sources with no verdict; teachings get Related Scriptures (style A, unlabeled, with the neutral note).

## Videos

100 queries (EVAL_V10_QUERIES.tsv, written before any run, none repeating an earlier query): Faith 30, Health 20, Prophecy 10, Morality 10, Origins 8, Money 7, Harmless 15; one backup per group.

## Reviews and beta pass marks (set before any score; EVAL_PLAN_v9.md)

Every reviewer file starts with REVIEWER_RULES.md. Blind-sample seed 20261204.
- A (Fred, blind): firm answers right at least 85%. Firm answers in the beta are scripture claims only. If fewer than 100 exist, Fred reviews all of them and the count is reported; the mark is judged on what exists.
- B (Bob): zero false accusations among "shown false" findings.
- C (Bob, captions): main point is what the video is mostly about, at least 80%; worded faithfully, at least 80%.
- D (Bob, blind): check-or-decline agreement at least 80%.
- Reported only: Related Scriptures relate (Bob), "not established" share, cost.
Passing permits a labeled beta only with Cary's go-ahead to go live.

## Budget

Within Cary's $500 a month. Backstop $50; expected about $20.

## Run record (November 23, 2026, night)

- Video list: EVAL_V10_VIDEO_IDS.tsv, 97 videos, SHA-256 b18469aed622400e6b7a8b2363fcc9e37e5332719995f2bc55d667a174fc60ec (written by the list script immediately before the run, from the first-result picks and same-group backups; no system output was seen during selection). Three slots stay empty (Morality 2, Origins 1); the Prophecy and Harmless backups were not needed.
- Run: software 4690d92 plus the wording fixes through aa4a0f9 (server restarted on aa4a0f9 before the run); all 97 videos had readable captions; none stopped early; cost $11.37.
- 12 declined by the scope rule; 85 checked; Related Scriptures on 57.
- Claims: 153 about what the Scriptures say (73 backed, 0 shown false, 80 not established); 176 factual claims with sources listed and no verdict (beta). No factual claim received a firm answer.

## Results (November 24, 2026, early morning)

- Gate A (Fred, blind): 70 of 73 firm answers right (95.9%); all 73 firm answers in the run were reviewed (fewer than 100 exist; the beta plan judges the mark on what exists). The 3 misses are "backed" claims Fred left "not established" for interpretive reasons (2 Corinthians 5:8 stated as an unqualified equivalence; a "man of sin" claim; whom Cain's anger was toward at Genesis 4:6). None was a wrong "shown false". Fred's "not established" sample: scripture claims 3 he would back, 1 he would call false, 3 not established; sources-only factual claims 13 backed, 1 false, 9 not established by his reading.
- Gate B: no "shown false" findings in the run, so no false accusations.
- Gates C and D (Bob): in progress; Bob's first reply covered 10 of 97 scope items (10 of 10 agree) and 8 of 83 main-claim items (8 of 8 main point, 8 of 8 worded faithfully; Related Scriptures relate 7 of 8). He is continuing in the same chat.
- Gate D (Bob, blind scope): 89 of 97 (91.8%), PASS. In 7 of the 8 differences Bob would check a video AIVerify declined (phone, dough, dog training, fishing gear, a game, varnish, gardening); in 1 he would decline a football video AIVerify checked.
- Gate C (Bob, captions): main point worded faithfully 68 of 77 determinable (88.3%), PASS; main point is what the video is mostly about 60 of 83 (72.3%), FAIL (beta mark 80%). Teaching headlines were right 47 of 47; fact headlines 12 of 34: the page showed claim 1 (the first checkable detail) instead of the whole-video main point the claim writer had produced. Related Scriptures relate (report only): 52 of 56.
- Fix (same day, after scoring): the headline is always the claim writer's whole-video main point (commit below). Because that text already exists in every v10 result, Bob rechecks the 34 fact-headline videos on the same outputs (no rerun); this is reported as a post-fix recheck, not as the frozen result.
