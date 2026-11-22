# Check Video v2: revision and next-test plan

Status: FROZEN on November 22, 2026. Approved by Bob with amendments; Cary agreed.

The plan is FROZEN once Cary agrees and before the first paid run. After that, nothing in it changes until the report is written. Any later change to code or thresholds needs a separately identified evaluation; it is never a continuation of this release test.

Goal: find out whether viewers get accurate, useful summaries that do not miss the video's main claims.

## 1. What changes in v2

These changes are approved, with Bob's safeguards. Each one targets causes listed in EVAL_DISPOSITIONS_v1.md.

| # | Change |
|---|---|
| R1 | **Cleaner claims.** Leave out only incidental wording. A comparison name may be dropped only when dropping it cannot change the comparison. Every number, date, qualification and context that changes the meaning stays, and the video's own words stay beside the claim. |
| R2 | **Part by part.** The judge marks each material part backed, shown false or not established. The label follows the weakest part, and code enforces this. Absolute words such as "only", "never", "all", "most" and "global" are material parts and are judged as stated. This is a general rule, not a topic exception. |
| R3 | **Material differences.** A different person, role, action, legal requirement, subject or outcome is a material difference, never loose wording. |
| R4 | **Bob's rule.** A source about the same study or event shows a part false when it shows a materially different trial, population or outcome. The absence of a confirming quotation never shows a part false. |
| R5 | **Time.** Later outcomes are never used to judge an earlier forecast. A later publication may still document facts that were already true at the relevant date; its publication date alone does not rule it out. An attributed forecast ("X said Y will happen") can be checked as a statement, without treating its outcome as established. |
| R6 | **Sources.** Directly relevant governing records and primary evidence come first, then reliable reporting. Each source is judged on its evidence, never on a label. On political claims only, network outlets (ABC, NBC, CBS, FOX, Newsmax) come after other reliable sources that carry the same evidence. A syndicated copy of a wire story is the same source, not corroboration. One decisive primary record can be enough. |
| R7 | **Plain labels.** "Backed by the sources checked", "Shown false by the evidence" and "Not established from the sources checked". |
| R8 | **Summary in facts.** A count of claims per label, with caption problems and incomplete coverage shown. No opinion verdict, and nothing that implies the whole video is false or that its creator meant to deceive. |

Software version: frozen at the commit named in the freeze record (section 6).

## 2. Development check (old videos; not release evidence)

- Re-run the videos that contain the 21 known-error claims, plus 8 videos with agreed firm claims chosen by seed 20261122. That is about 25 videos.
- New outputs are saved in a separate folder, so no old record is overwritten.
- Provisional reference labels are working repair targets, not unquestionable truths. Regressions are investigated, and nothing is tuned against the fresh test set.
- Budget: $3.50 at most.

## 3. Fresh held-out test (release evidence)

**Videos**
- 60 fresh ordinary videos, using v1's 10 ordinary categories in about the same proportions, published within 3 years, and none seen before.
- Quotas: Health 14, Politics 9, War/world 7, History 5, Money 5, News/disasters 5, Science/space 5, Conspiracy 4, Satire 3, Viral footage 3.
- Category quotas, the selection method, video IDs and order, reference dates, software version and random seeds are all frozen before any run.
- Videos are chosen without looking at system outputs. Failed or difficult videos are never replaced.
- Prophecy videos are optional and reported separately. They run only if the budget allows after the 60.

**Cary (main task)**

For every video, Cary answers three quick questions. Each answer is yes, partly or no.
1. Is the summary accurate?
2. Does it cover the central question and important qualifications?
3. Is it useful?

For claims where reviewers disagree, Cary gets one short consolidated evidence list. Unresolved items are kept as unresolved if he declines further per-claim grading. No long adjudication session is required.

**Blind component sample**
- 100 randomly sampled firm answers and 30 randomly sampled "not established" answers, in a seeded order fixed before the run.
- The firm answers should come from at least 30 distinct ordinary videos.
- If fewer than 100 firm answers, 30 "not established" answers or 30 contributing videos exist, the shortfall is reported and the affected gate is marked INCONCLUSIVE. Favorable replacements are never chosen.
- Fred sets the reference answers from sources he opens himself, before seeing any system label or reasoning.
- The whole-video interval keeps each claim grouped with its video and accounts for the sampling design.
- The calculation is recorded before the run: v1's bootstrap with seed 20261121 and 10,000 draws, resampling videos and weighting each sampled claim by its inverse sampling probability.

**"Shown false" safety review**
- Every "shown false" finding is reviewed independently: the finding, its explanation and its evidence.
- This is a separate safety check. Its findings are not added to the random accuracy sample.

## 4. Pass thresholds (Bob's, replacing the draft)

All four gates must pass. An insufficient sample or an unresolved result is INCONCLUSIVE, never a pass.

**A. Component accuracy**
- At least 90% correct in the blind firm-answer sample, AND a whole-video 95% lower bound of at least 80%.
- Unresolved reference answers are calculated both ways. The conservative calculation must pass.

**B. "Shown false" safety**
- ZERO confirmed false accusations and ZERO unresolved findings among all "shown false" findings.
- The count, precision and an uncertainty interval are reported.
- If there are no "shown false" findings at all, the capability is marked untested and cannot be enabled in the pilot.

**C. Usefulness and completeness**
- At least 48 of the 60 ordinary videos (80%) must get YES on ALL THREE of Cary's questions.
- "Partly" is not YES. Missing captions, failed runs and missing grades stay in the denominator and do not count as successes.
- A genuinely non-factual video can pass when the summary correctly explains that it has no checkable factual claims.
- Each question is also reported separately.

**D. Reported, not a gate**
- firm-answer coverage
- missed central claims
- over-caution
- caption failures
- timing
- actual cost

A pass permits only consideration of a scoped private pilot. It is not approval for a public release, and it is not proof of general accuracy.

## 5. Budget (hard ceilings)

- Cary set the limits on November 22, 2026: $39 in total for this plan and a $15/day backstop. That is triple Bob's proposed $13 and $5/day, and it is within Cary's $500 monthly budget.
- The total covers development, captions, judging, retries and any paid reference checks.
- Before each batch, Claude checks the spend so far against both caps. Claude stops and reports incomplete work if the next request could exceed either one.
- Estimated cost: development $3.50 and the fresh test about $8.50. The margin covers retries.
- No new subscriptions, no deployment and no unrelated analytics work.

## 6. Freeze record (filled in at freeze, before the first paid run)

- Plan text: frozen at this commit, with Cary's agreement on November 22, 2026. He approved all of Bob's amendments, and his own decisions on items 3, 6, 8 and 9 are recorded here and in EVAL_DISPOSITIONS_v1.md.
- Software commit: the commit that carries this line. Any later code change starts a separately identified evaluation.
- Development check: about 25 old videos (section 2). Not release evidence.
- Software commit, exact: 39f49e9. The local server ran this code for the development check and runs it for the fresh test.
- Development check done on November 22: 24 old videos, $3.50. Results are in the runs folder under dev-v2. No code was changed after it.
- Fresh video list: EVAL_V2_VIDEO_IDS.tsv, 60 videos, SHA-256 8f1b0e1b11bb1c1b3d2537ef6b35a13fef3ba2eb608f82a9659018e9023a49d0. Picked by the fixed v1 rule: the first search result with at least 10,000 views, posted within 3 years and not used before, one query per quota slot. One query ("census apportionment explained") returned no qualifying video, even on a retry. Its slot went to a backup politics query ("debt ceiling explained"), chosen before any fresh run. No system output was seen during selection.
- Component sample seed: 20261122. The bootstrap uses seed 20261121 and 10,000 draws, as in v1.
- Fresh run, November 22: the API credit ran out after 25 videos (22 finished, 3 genuine caption failures). After Cary added credit, the 35 interrupted runs were rerun on the same videos, not replaced. Cary raised the day backstop to $20 for November 22 only, so the last 9 could finish (day total $15.86, of which about $4 was holds on rejected calls). The launcher gained a -DailyUsd option for this; pipeline code is unchanged at 39f49e9. All 60 are saved: 57 finished and 3 caption failures. Plan spend $11.50 of $39.
- Blind sample drawn: 100 firm answers from 47 videos and 30 "not established" answers (221 claims; 107 firm available). No shortfall.
