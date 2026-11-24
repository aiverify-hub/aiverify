# Check Video v10: tuning log

Cary, November 23, 2026: tune with small sets that get harder each round, reviewed by Fred and Bob; hand-picking is allowed for tuning sets; the final proof is one honest random set (first-result rule). Beta pass marks (EVAL_PLAN_v9.md): zero false accusations; accuracy 85%; main point and scope 80%.

## Set 1 (November 23, 2026): 8 new videos, 10 queries, first-result rule

Queries: what does the bible say about money; jesus wept explained; book of job summary (none); who was cains wife; seed cycling hormones; alkaline diet claims (none); four horsemen revelation; bible on anger; church debt crisis; bread baking tutorial. Runs folder: fresh-v10a (first run, commit 092b664) and fresh-v10b (rerun after the translation and speaker rules, commit 180c74c). Reviews are of fresh-v10b. Cost $1.10.

| Check | Result | Beta mark |
|---|---|---|
| Firm answers right (Fred, blind) | 10 of 10 (all scripture claims) | 85% |
| False accusations | 0 ("shown false" findings: none) | 0 |
| Main point (Bob) | 7 of 8 | 80% |
| Claims match the video (Bob) | 7 of 7 determinable (1 cannot determine: headline cut mid-word, fixed in 4888760) | 80% |
| Scope (Bob) | 8 of 8 | 80% |
| Related Scriptures relate (Bob, report only) | 4 of 6 | none |

Over-caution: of 5 scripture claims left "not established", Fred would back 4 (detail check on "need only"; a long summary the caption passage did not state word for word; a number flagged from captions). Web facts (sources only): Fred would back 7 and call 1 false of 16.

Not adopted: Bob asked that Related Scriptures be labeled where a verse is in tension with a video's teaching; that would interpret the verses, which Cary's rule forbids.

Fixes after set 1: modern-translation wording and Gospel speakers (180c74c); main point never cut mid-word (4888760); Bob's main-claim file now shows the headline (reviewer file builder).

## Set 2 (November 23, 2026): 9 harder hand-picked videos

Queries chosen for difficulty (misquotes, contradictions, date-setting prophecy, flat earth, keto and cancer, faith teachings); three empty slots refilled from alternate queries. Runs folder fresh-v10c, commit 4888760, cost $1.13.

| Check | Result | Beta mark |
|---|---|---|
| Firm answers right (Fred, blind) | 6 of 7 (the miss: a genealogy claim Fred left "not established" because the video's own words were garbled) | 85% |
| False accusations | 0 | 0 |
| Main point (Bob) | 9 of 9 | 80% |
| Main point worded faithfully (Bob) | 6 of 9 (strengthened "may" to "often", dropped a stated condition, added a specific year) | 80% |
| Scope (Bob) | 9 of 9 | 80% |
| Related Scriptures relate (Bob, report only) | 3 of 7; Bob read prophecy verses under a date-setting teaching as implying support | none |

Over-caution: of 7 scripture claims left "not established", Fred would back 4. Web facts (sources only): Fred would back 12 and call 2 false of 21.
Gap seen: "'God helps those who help themselves' is not in the Bible" was classed as a web fact rather than checked against the local text.
Fix after set 2: the main point keeps the speaker's qualifiers and strength.

## Set 3 (November 23, 2026): 12 harder hand-picked videos

Queries chosen for misquotes and "not in the Bible" sayings, a scholar's case that Jesus never claimed to be God, hell's origins, tithing, the mark of the beast and COVID, the Book of Enoch, alcohol, spices and cancer, wealth, and "the kingdom is within you". Runs folder fresh-v10e (commit a3cbc7e: the absence rule and the kind-preserving repair; first run fresh-v10d exposed a reworded scripture claim that came back as a fact and got a firm answer, fixed before this run). Cost $1.49.

| Check | Result | Beta mark |
|---|---|---|
| Firm answers right (Fred, blind) | 9 of 9 | 85% |
| False accusations | 0 | 0 |
| Main point (Bob) | 11 of 12 | 80% |
| Main point worded faithfully (Bob) | 10 of 12 | 80% |
| Scope (Bob) | 12 of 12 | 80% |
| Related Scriptures relate (Bob, report only) | 4 of 11 | none |

Bob's Related Scriptures "no" answers ask for verses to be labeled where they are in tension with a teaching or are an opponent's words; that would interpret the passages, which Cary's rule forbids. The page now says under every list that the passages speak to the same subject and AIVerify does not say whether they agree (7f8b310); the next reviewer file will show that line.
Over-caution: of 11 scripture claims left "not established", Fred would back 6 and call 1 false.
Also fixed during set 3: AIVerify's own wording never says "KJV" or "Bible" (11317a9, 4690d92, aa4a0f9).

## Totals after three tuning sets (29 videos)

Firm answers right 25 of 26 (96%); false accusations 0; main point 27 of 29 (93%); main point worded faithfully 23 of 29 (79%); scope 29 of 29.

## Related Scriptures style decision and watch list (November 23, 2026)

Cary saw both styles on real examples (the tithing video and "Jesus Never Claimed To Be God") and could not choose; he left it to Claude with one condition: point out real test examples where the other style would have been better. Decision: style A (verses with the neutral note, no labels). Watch list: each tuning or test set, list the cases where a factual label (who is speaking, where a passage continues) would have prevented a misreading, and show them to Cary.

Watch list so far (from set 3): "Jesus Never Claimed To Be God": John 10:33 is the words of Jesus' opponents, shown without saying so. Tithing video: Malachi 3:8-10 is addressed to Israel, shown without saying so.
