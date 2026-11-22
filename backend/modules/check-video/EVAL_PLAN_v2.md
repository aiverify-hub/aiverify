# Check Video v2: revision and next-test plan

DRAFT. This plan is not frozen until Bob approves it and Cary agrees. Once it is frozen, nothing in it changes until the test report is written.

## 1. What changes in v2

These changes follow Bob's decisions of November 22, 2026 and Cary's direction. They are aimed at the error causes listed in EVAL_DISPOSITIONS_v1.md.

| # | Change | Fixes |
|---|---|---|
| R1 | **Cleaner claims.** Leave out only incidental wording, such as a filing date or the name of a comparison item. Keep every number, date, qualification or context that changes the meaning. The video's own words stay beside the claim. | Incidental details blocking an answer |
| R2 | **Part by part.** The judge lists the claim's material parts and marks each one backed, shown false or not established. The label follows the weakest part: any part shown false gives "Shown false"; otherwise any part not established gives "Not established". This is checked in code, not left to the model. | Causes A and B |
| R3 | **Material differences.** A different role, action, legal requirement, subject or outcome is a material difference, never loose wording. | Cause C |
| R4 | **Bob's rule.** A source describing the same study or event can show the claim false when it shows a materially different trial, population or outcome. The absence of a confirming quotation never shows a claim false. | Cause E |
| R5 | **Time window.** Forecasts and "as of" claims are judged as of the publish date. Later events go in a note and never decide the label. | Cause D |
| R6 | **Sources.** Directly relevant governing records and primary evidence come first, then reliable reporting. On political claims, network outlets (ABC, NBC, CBS, FOX, Newsmax) go after other reliable sources that carry the same evidence. A copy of the same wire story on another site is the same source, not corroboration. One decisive primary record can be enough. | Source quality |
| R7 | **Plain labels.** "Backed by the sources checked", "Shown false by the evidence" and "Not established from the sources checked". | Bob decision 3 |
| R8 | **Video summary in facts.** For example: "4 claims checked: 2 backed, 1 shown false, 1 not established." Caption problems and incomplete coverage are shown. No opinion verdict, and nothing that implies the whole video is false or that its creator meant to deceive. | Bob decision 3, Cary |

Not in this revision (later, if the test shows they are needed):
- a fallback to syndicated copies of Reuters stories
- wider retrieval to reduce over-caution

## 2. Development (old 100 videos; not release evidence)

- Re-run the 21 known-error claims and a seeded random 20 of the 108 agreed firm claims.
- Goal: the known errors are fixed and the agreed claims do not get worse.
- This is a development check only. It is not graded for release.
- Cost: about $5, within one day's limit.

## 3. Fresh held-out test (the release evidence)

**Videos**
- 60 new ordinary videos, plus up to 4 prophecy videos, reported separately.
- Chosen the same way as before: same categories, published within 3 years, and none used in development.
- The list is frozen (IDs and order) before any run.
- Cost: about $8.

**Cary (main task)**

Cary gives one grade per video. He answers three questions:
1. Is the summary accurate?
2. Does it cover the video's central question and important qualifications?
3. Is it useful to a viewer deciding whether to believe the video?

Each answer is yes, partly or no, with an optional note.

**Blind component sample**
- 100 firm answers (backed or shown false), so the accuracy interval is tight enough to judge, plus 30 "not established" answers to measure over-caution.
- They are chosen by a seeded random order that is fixed before the run.
- Fred judges them without seeing AIVerify's answers.
- Disagreements are settled by Cary against the sources. Bob gives a third opinion on heavy documents.
- Unresolved items are left visible and reported both ways, never forced.

**Every "Shown false" finding is reviewed**
- Each one is reviewed, whether or not it is in the sample.
- This is a precision check, because a wrong "shown false" is the most harmful mistake.

**Reported separately**
- accuracy on the sample (whole-video interval, same method as v1)
- coverage
- missed central claims
- caption failures
- precision of "shown false" findings
- Cary's overall grades

## 4. Pass thresholds (proposed; Bob to approve before freezing)

| Gate | Threshold |
|---|---|
| Component accuracy (blind sample) | Lower 95% bound at 80% or above. Unchanged; not lowered. |
| "Shown false" precision | At least 90% confirmed, and no serious false allegation left unresolved. |
| Cary's overall grade | "Accurate = yes" on at least 80% of videos, with no video graded "no" for a shown-false error. |
| Coverage (reported, not a gate) | Firm answers on more than 46% of claims, which was v1's rate. |

A pass makes v2 eligible for a scoped private pilot only. It is not a public release, and deployment still needs Cary's explicit go-ahead.

## 5. Spending and limits

- Total about $13: $5 for development and $8 for the fresh test.
- At the $5/day limit this takes about 3 days. Cary can raise the daily backstop for test days if he wants it faster.
- No deployment and no new subscriptions.
