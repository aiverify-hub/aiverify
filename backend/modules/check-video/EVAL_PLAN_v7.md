# Check Video v7: release test plan (short videos, new scope)

Status: FROZEN on November 23, 2026, before any v7 video was picked or run. Development decisions are Claude's under Cary's standing approval; the scope, page wording and review method follow Cary's decisions of November 23, 2026. Fred and Bob agreed to the rules and tasks first (alignment round below).

It reuses the v6 plan (EVAL_PLAN_v6.md) except where this file says otherwise.

v6 result: NOT ELIGIBLE. Gate A: Fred 82 of 100. Gate C: the main claim was the video's main point in 44 of 75 videos. Gate B: Bob confirmed 6 of 9 (1 false accusation, 2 unresolved).

## 1. What changed in v7 (commits 15262cf and cb663b4)

| # | Change | Cause |
|---|---|---|
| G1 | Scope (Cary): AIVerify checks a video when its claims, if false, could deceive viewers in a way that harms them, damages their faith, or leads them the wrong way. Judged by the video's actual claims, not its category; when unsure, it is checked. Other videos are declined before any paid search. | Cary's direction for the platform |
| G2 | The page states: "AIVerify checks videos to show whether they line up with the truth according to the Scriptures." (Cary's approved wording; the words "Bible" and "KJV" are not used on the page.) | Cary |
| G3 | The main claim is what the whole video is mostly about, taken from the title and the opening and closing of the captions (Cary: "tell them what you're going to tell them..."). A list video with no overall claim says so in the headline. | v6 gate C: 31 of 75 main claims were an opening hook or a first list item |
| G4 | A "backed" answer needs a second, independent judge (Claude Opus 5.5, same excerpts) to agree. | v5 and v6 gate A: nearly all disagreements were "backed" claims |
| G5 | Hedges ("appears to be", "may") are never shown false unless the hedged statement itself is wrong, but a hedge does not protect a separate false premise. Unclear wording is "not established" only when the context cannot settle it and the meanings would change the answer. Beliefs, doctrines, interpretations of scripture and moral value judgments are never labeled true or false. | v6 gate B: 1 false accusation, 2 unresolved; Fred's and Bob's alignment changes |
| G6 | Contradictions need the same population, measure, time and conditions. | Fred's alignment change |

Alignment round (Cary: Fred and Bob must agree on what to do, not why): both proposed changes to the draft rules; Cary agreed to all of them on November 23, 2026; they are in G1, G5, G6 and REVIEWER_RULES.md (commit cb663b4).

Development check (INVALID, see the correction below): 45 v6 videos behind the gate A, B and C problems, November 23, $7.24, in the runs folder under dev-v7 (run on 15262cf, before the alignment changes; practice material only). Main claims moved from opening hooks to the videos' main points in most of the flagged videos, and 7 list videos were labeled as lists. Bob's false accusation became "not established"; his confirmed findings stayed "shown false" except 3 on harmless history or science videos that were declined. Of Fred's 18 gate A disagreements, 6 became "not established", 3 were declined, 2 changed wording, and 7 stayed "backed" (the second judge agreed with the first).

## 2. Videos

100 new videos chosen by the v5 selection rule (20 seconds to 2 minutes, at least 10,000 views, posted on or after November 22, 2023, first qualifying search result, never used before). The queries (EVAL_V7_QUERIES.tsv, written before any v7 run, none repeating an earlier query) follow the new scope: Health 25, Faith 25, Morality 10, Prophecy 8, Origins 8, Money 8, and 16 queries for ordinary harmless content to test declining. Backups, one per group, are used in order only when a query finds no qualifying video.

## 3. Reviews

Every reviewer file starts with REVIEWER_RULES.md (commit cb663b4) with today's date filled in.

- Gate A (Fred, blind): 100 firm and 30 "not established" claims from the checked videos, seed 20261128, as in v6. Pass: at least 90 of 100, and a whole-video 95% lower bound of at least 80%.
- Gate B (Bob): every "shown false" finding. Pass: every one confirmed. Bob's other answers go to Cary, one at a time; an item Cary does not decide fails the gate.
- Gate C (Bob, full captions): for each checked video, does the main claim say what the video says, and is it what the whole video is mostly about (or, for a list video, is "no single main claim" right)? "cannot_determine" is allowed and reported. Pass: at least 90% yes on each question among the videos Bob can determine.
- Gate D (Bob, scope): for every video with readable captions, check or decline under the scope rule. Pass: Bob agrees with AIVerify on at least 90%. Each disagreement goes to Cary only if he wants to see it.
- Declined videos are excluded from gates A to C. Caption failures are reported only.
- Cary sees only disagreements, one per screen: the claim, the video link, two answers each with its link, and buttons A, B, Can't tell.

## 4. Budget

Within Cary's $500 a month. Runaway backstop $50. Expected about $20 (development: $0.16 a video).

## 5. Freeze record

- Software commit: a108032 (cb663b4 plus one safety change, before any v7 run: an empty Exa account now stops the check).
- Correction (November 23, 2026, before any v7 run): the Exa account ran out of credits during the development check; 83 of its 143 claims got no search (HTTP 402) and were judged on no sources. Its numbers above are therefore not evidence of improvement, except the main-claim and list-video changes, which happen before any search.
- Queries: EVAL_V7_QUERIES.tsv (100 queries plus 7 backups).
- Video list: EVAL_V7_VIDEO_IDS.tsv, 92 videos (76 in the new scope groups, 16 harmless), SHA-256 5e50491b84ea4a425a6d86cdbfdef26c23345bde4adfb1899039f3cd6a60aa96 (LF line endings, as written). Eleven queries found no qualifying video; three were refilled from that group's one backup (oil pulling benefits, ark of the covenant location, ivf embryo facts; the Money backup also found none). Eight slots stay empty, because no new query may be added after the freeze: Health 1, Faith 1, Morality 2, Money 4. Short scam and advocacy videos often lacked 10,000 views or were older than three years. No system output was seen during selection.

## 6. Stopped (November 23, 2026)

Stopped by Cary's decision after 7 of 92 videos ($1.63): AIVerify will not check videos under 3 minutes (a viewer can judge a short video quickly, and short videos used most of the cost). No v7 result is reported. The software and rules continue in the v8 test on videos of 3 to 20 minutes (EVAL_PLAN_v8.md).
