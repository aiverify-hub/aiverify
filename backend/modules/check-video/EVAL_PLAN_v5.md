# Check Video v5: release test plan (short videos)

Status: FROZEN on November 22, 2026, before any v5 fresh run. Cary gave a standing approval for development decisions ("Master approval to do what is needed").

A separately identified evaluation. It reuses the v2 plan (EVAL_PLAN_v2.md) and the v3 and v4 changes unchanged except where this file says otherwise.

v4 result: gates A and B passed (Fred 98 of 100 firm answers; Bob 4 of 4 "shown false" confirmed). Not graded by Cary: 69% of claims were "not established", and of 30 sampled ones Fred found 22 with a firm answer, so v5 was built first to avoid grading output that would change.

## 1. What changed in v5 (commits 52ba86a and e039beb)

| # | Change | v4 cause |
|---|---|---|
| E1 | The claim writer never adds a number, name, date, place, term or explanation from outside the video. | a claim got "redshift 14.32" the video never said |
| E2 | A claim is rewritten once from its caption passage (Cary's retry idea): before the search when it has numbers the captions do not say, and after the detail check when every failing detail was one the claim writer added. Details the video said are always kept, even wrong ones; a rewrite not found in the captions is discarded. | 25 claims withheld for numbers the video never said |
| E3 | The detail check gives each detail a kind. Only "wording" (framing, tense, a title variant of the same person or thing) may differ; numbers, dates, people, places, actions, causes and absolute words stay strict. | detail-check failures on wording such as "Professor" vs "Associate Professor" |
| E4 | When the sources do not settle a claim, one more search with the judge's own query for the deciding primary source, new pages first (up to 6 sources), then judge again (Cary: "finding the right search data was the key"). | 108 of 242 "not established" were "sources did not settle it" |
| E5 | The claim writer gets 3,000 tokens (was 2,000). | one unreadable claim list in development |

Considered and dropped: skipping the caption service when the watch page lists no caption tracks (2 earlier videos listed none but had captions).

Development check: the same 40 fresh-v4 videos, November 22, $11.11, in the runs folder under dev-v5b (practice material, not release evidence). Labels on those videos: v4 backed 45, shown false 4, not established 109 (69%); v5 backed 73, shown false 2, not established 83 (53%). Against Fred's and Bob's v4 references, matched by claim similarity: of 46 claims where v4 and Fred agreed, v5 kept 34, 9 became "not established", 0 became a wrong firm answer, 3 had no matching claim. Wrong firm answers: 1 repeated v4 error (mouse diet study) and 1 claim Fred rated "not established" that v5 backed (hearing aids, 1 in 7). Both v5 "shown false" findings were ones Bob confirmed in v4. Cost about $0.28 a video (v4 about $0.21).

## 2. Videos

- 100 new videos from 20 seconds to 2 minutes long (Cary, November 22: grading must fit his time; short videos carry most viral claims). The categories are as in v4: Health 23, Politics 15, War/world 11, History 9, Money 8, News/disasters 8, Science/space 9, Conspiracy 7, Satire 5, Viral footage 5.
- New queries, one per slot, written before any v5 run without seeing system output on them: EVAL_V5_QUERIES.tsv. No query repeats a v1 to v4 query.
- Selection rule: for each query, the first search result in page order (regular video or YouTube Short) that is 20 to 120 seconds long, has at least 10,000 views, was posted on or after November 22, 2023, is not a live stream, and was never used before (every video from v1 to v4 and development is excluded). Length and date come from the video's public watch page. The 20-second floor was set after a test pick returned a 10-second clip with no speech.
- Failed or difficult videos are never replaced. Outages are rerun on the same video.
- A pass covers videos up to 2 minutes only. Longer videos need their own test (planned with claims taken from the opening and closing minutes).

## 3. Order of review

As in v4 section 3, with one change: Cary may grade before Fred's and Bob's reviews are back, at his choice. His grades count only if gates A and B pass; if they fail, the software changes and the grades are redone on the new run.

## 4. Gates

Unchanged from v2 section 4, as in v4: gate C needs at least 80 of 100 videos YES on all three questions.

## 5. Budget

Within Cary's $500 a month. Runaway backstop for this test: $50. Expected about $25 to $30. The run starts after midnight (November 23) because November 22 spending reached $76 of the $100 day guard.

## 6. Freeze record

- Software commit: e039beb.
- Video list: EVAL_V5_VIDEO_IDS.tsv, 100 videos, SHA-256 7d948c5e4f7c27ed5291ae77b6280716cdc2be83d44ceb24839846f516a4f051 (LF line endings, as written). Three queries found no qualifying video (aspartame cancer warning, china spy balloon, 5g conspiracy); backups were chosen before any v5 run: salt substitute heart study, drone attack news, titanic conspiracy theory. Two other conspiracy backups (mandela effect explained, hollow earth theory) were dropped unused because they repeated earlier queries. No system output was seen during selection.

## 7. Run record

- Fresh run: November 23, 2026, just after midnight Eastern, software e039beb, all 100 listed videos, none replaced. Results in the runs folder under fresh-v5. Cost $17.88 (about $0.18 a video).
- 85 videos produced a result; 15 had no captions (the caption service and the watch page both found none). These stay in the test as "couldn't read captions" results; Cary grades them like any other video. 10 of the 85 had no checkable claim.
- 263 claims: backed 124, shown false 7, not established 132 (50%; v4 69%). 13 claims were rewritten once from the captions; 63 got a second search, and 14 of those ended with a firm answer.
- Review files (November 23): Fred's blind file has 100 firm claims from 57 videos and 30 "not established" claims (131 firm and 132 "not established" available; sample seed 20261126; no AIVerify labels in the file). Bob's file has all 7 "shown false" findings. Cary's page covers all 100 videos.
