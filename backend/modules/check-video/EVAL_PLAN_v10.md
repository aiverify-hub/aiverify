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
