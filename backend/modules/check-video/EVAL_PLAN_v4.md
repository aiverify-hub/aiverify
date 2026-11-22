# Check Video v4: release test plan

Status: FROZEN on November 22, 2026, before any v4 fresh run. Cary gave a standing approval for development decisions ("Master approval to do what is needed").

A separately identified evaluation. It reuses the v2 plan (EVAL_PLAN_v2.md) and the v3 changes (EVAL_PLAN_v3.md) unchanged except where this file says otherwise.

v3 result: NOT ELIGIBLE. Gate B passed (Bob confirmed both "shown false" findings). Gate A: Fred agreed with 71 of 87 firm answers (81.6%), and only 87 firm answers existed. 12 of the 16 disagreements were "backed" claims with one wrong detail.

## 1. What changed in v4 (commits 189d785 and 627800e)

| # | Change | v3 cause |
|---|---|---|
| D1 | Every "backed" finding gets a separate detail check against all excerpts: every person, number, date, place, comparison and absolute word must be stated. Anything else (including a failed check) withholds it. A differing detail is never turned into an accusation. | 12 of 16 gate A disagreements |
| D2 | A corrected name or place spelling is not a guess when the correction is found in the captions and the claim and the sources use the corrected name. Numbers, dates and meaning corrections stay strict. | 24 judge-backed claims withheld only for name spellings |
| D3 | Claims the caption rules will withhold skip the paid second checks. | cost |

Development check: 38 fresh-v3 videos, November 22, $7.80, in the runs folder under dev-v4 (practice material, not release evidence). Projected on Fred's v3 references: 59 firm answers, 51 agreeing (86.4%). No code changed after it except turning D2 on.

## 2. Videos

- 100 new ordinary videos, so that at least 100 firm answers are likely: Health 23, Politics 15, War/world 11, History 9, Money 8, News/disasters 8, Science/space 9, Conspiracy 7, Satire 5, Viral footage 5.
- New queries, one per slot, written before any v4 run without seeing system output on them: EVAL_V4_QUERIES.tsv. No query repeats a v1 to v3 topic on purpose.
- The fixed v2 selection rule, excluding every video used in v1, v2, v3 or development (220).
- Failed or difficult videos are never replaced. Outages are rerun on the same video.

## 3. Order of review

1. Fred: blind sample of 100 firm and 30 "not established" answers, seed 20261124, from at least 30 videos. A shortfall is reported and makes gate A INCONCLUSIVE.
2. Bob: every "shown false" finding (gate B), and a report-only spot check of 10 seeded claims where Fred and AIVerify agree.
3. Disagreements between Fred and AIVerify: one short consolidated evidence list (blind A/B) for Cary, as in v2 section 3. Unresolved items are calculated both ways; the conservative calculation must pass.
4. Cary grades the videos (gate C) only if gates A and B pass.

## 4. Gates

Unchanged from v2 section 4. Gate C is scored on 100 videos at the same rate: at least 80 of 100 YES on all three questions.

## 5. Budget

Within Cary's $500 a month. Runaway backstop for this test: $50. Expected about $25.

## 6. Freeze record

- Software commit: 627800e.
- Launcher only, before any v4 run: the day backstop guard was raised from $50 to $100 (run-local.ps1 and the server setting), because the 100-video test and the same-day development checks pass $50 in one day. Pipeline code is unchanged at 627800e.
- Video list: EVAL_V4_VIDEO_IDS.tsv, 100 videos, SHA-256 847105ff8d47e2906b149dbf723d7b8418e2381e46df3155d15556df0a7785c0 (LF line endings, as written). Three politics queries (line item veto explained, census undercount, immigration court backlog) found no qualifying video, even on a retry. Backups chosen before any v4 run: how a bill becomes law (also none), senate confirmation hearing explained, lobbying explained, speaker of the house vote. No system output was seen during selection.
