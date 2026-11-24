# Check Video: second beta sample (v11), videos of 3 to 20 minutes

Status: FROZEN on November 24, 2026, before any video was picked or run. Requested by Cary after the v10 final test and Fred's code review passed ("Let's run another large sample").

Software: commit eca9e8f (v10 beta build plus Fred's code review fixes; Fred: ready_for_beta, no findings). No code changes for this sample.

Same method as EVAL_PLAN_v10.md: first-result rule, no hand-picking; 100 new queries (EVAL_V11_QUERIES.tsv; none repeats an earlier query) in the same groups (Faith 30, Health 20, Prophecy 10, Morality 10, Origins 8, Money 7, Harmless 15) with one backup per group; the same reviewers, rules and beta pass marks (false accusations 0; accuracy 85%; main point and its wording 80%; scope 80%). Blind-sample seed 20261205. Bob's main-claim file shows the headline (the whole-video main point).

Budget: within $500 a month; expected about $15.

## Run record (November 24, 2026, early morning)

- Video list: EVAL_V11_VIDEO_IDS.tsv, 97 videos, SHA-256 185360b04e5eae6ce2bb2c9cd13553faf4a04f910f305604b2b4a2ecb88a7c84 (written by the list script immediately before the run; no system output seen during selection). Three slots stay empty (Morality 1, Origins 1, Money 1).
- Run: software eca9e8f; cost $10.26; 93 with readable captions (4 without); 11 declined by the scope rule; none stopped early; Related Scriptures on 54.
- Claims: 125 about what the Scriptures say (57 backed, 0 shown false, 68 not established); 188 factual claims with sources only (beta). No factual claim received a firm answer.
- Review files: FRED_V11_BLIND (all 57 firm + 30 not established, seed 20261205), BOB_V11_1_SCOPE (93), BOB_V11_3_MAIN_CLAIM (80, headline = whole-video main point). No "shown false" findings, so no gate B file.

## Fred's blind review (November 24, 2026)
Scored with score-v11.cjs (same method as v10f: bootstrap seed 20261121, 10,000 draws, resampling videos).
- Firm answers (all "backed"; AIVerify gave no "shown false"): 57 checked, Fred agrees on 55 = 96.5%; 95% lower bound 91.1% over 29 videos. Mark A (85%) passed.
- False accusations: 0 (AIVerify said "shown false" nowhere). Mark B passed.
- The 2 disagreements are both Fred preferring "not established" over "backed" (no case where AIVerify's firm answer was called wrong):
  - NcLAnGVrJk0-c3: Exodus 20:11 wording is right, but the captions say "20:1"; Fred wants audio to tell a wrong verse from a dropped digit.
  - aNv_W4TOIhA-c3: Malachi 2:16 wording is right; Fred says who the "hatred" clause refers to depends on interpretation (rule 12).
- Not-established sample (30): Fred would give 17 backed, 9 not established, 4 shown false. All 4 "shown false" are web facts, which show sources only in the beta (by design). The rest is the known over-caution (safe side).
Waiting: Bob's scope and main point reviews (marks C and D).

## Bob's reviews (November 24, 2026)
Same bootstrap (seed 20261121, 10,000 draws, one item per video). cannot_determine left out.
- Scope (93 videos): Bob agrees on 88 = 94.6%, lower bound 89.2%. Mark passed.
  - AIVerify checked 2 sports-highlight videos Bob would decline (dlD_Wr5aXc8, 02h7MB4Re4o): costs money only.
  - AIVerify declined 3 Bob would check (9C2o9aInUu0 phone marketing, ds4wNrmu7Ds travel costs, mhr3REshTss companion planting): borderline money claims, none about faith.
- Main point (80 videos): 79 of 80 = 98.8%, lower bound 96.3%. Mark D passed.
  - OUT1NEw__i8: AIVerify called it a list; Bob says the closing message (no pastor above accountability) is the main point.
- Wording matches the video: 75 of 79 = 94.9%, lower bound 89.9%. Mark C passed.
  - The 4 misses each overstate or narrow a speaker's qualifier (Zf5Qg75tiXA, lbyYGWlJ6qI, 5zyvNYaUFq8, XJSrKBpQttQ): the known caveat-retention item on the later list.
- Related Scriptures (54 videos with verses): 53 yes, 1 no = 98.1%, lower bound 94.4%.
  - sH6ESIFwpzI: John 10:27 (following Jesus) shown under a teaching about hearing replies in prayer. A relevance miss, not a labels case, so the style watch list is unchanged.

## Result
All beta marks passed: A 96.5% (lower bound 91.1%), B 0 false accusations, C 94.9%, D 98.8%, scope 94.6%.
Next: Cary's go-live decision.
