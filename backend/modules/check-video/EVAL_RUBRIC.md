# Check Video evaluation rubric, version 1 (frozen November 21, 2026)

This file freezes how the 100-video evaluation is graded. It is fixed before batches 2–4 are run or graded. It does not change how videos are checked; the application rules stay frozen at commit 4e14973.

Sources:
- Fred's grading method, section I of `CHECK_VIDEO_FRED_TASKS_I_J_K.txt`, applied as written.
- Bob's decision `BOB_SECTION_I_DECISION.txt` (Nov 21, 2026), which approved section I with amendments 1–5 below.
- The arithmetic is in `scoring.cjs`. Synthetic tests are in `test/scoring.test.cjs`.

## Population (frozen)
- 100 videos: 96 ordinary and 4 prophecy. The IDs are in `EVAL_VIDEO_IDS.tsv`.
- Batch sizes: batch 1 has 25 ordinary, batch 2 has 25 ordinary plus the 4 prophecy videos, batch 3 has 25 ordinary, and batch 4 has 21 ordinary.
- Videos were picked by a fixed rule: the first search result per preset query with at least 10,000 views, posted within the last 3 years, and not used before. No video is removed after grading. Failures and no-claim videos stay in.
- **Disclosure:** batch 1 was run, reviewed and adjudicated before this rubric was frozen, so this rubric is prospective only for batches 2–4. An earlier blind test (84%, 20 videos) used older, looser rules and is reported separately.

## Labels
The application's labels map as follows:
- **S** = supported
- **C** = contradicted
- **M** = misleading
- **U** = can't determine, including any held-back verdict
- **FAIL** = missing or crashed output

The adjudicated reference label is one of:
- **S**, **C** or **U**
- **D** = dispute unresolved

Full definitions are in section I.1.

## Bob's amendments
1. **Usefulness gate.** For each video, the central factual question is defined independently of AIVerify's answers (see below). The gate passes when at least 50% of the 96 ordinary videos get a useful, evidence-supported answer to that question. "Useful" requires the correct material qualifications; one correct incidental fact does not count.
   - Access failures, crashes and extraction misses stay in the denominator.
   - Genuinely non-factual videos are counted and reported separately.
   - If too many non-factual videos are included for the denominator to be fair, the result is INCONCLUSIVE and a new prospective sample is agreed. They are never deleted after grading.
   - *Implementation choice, open to Bob's review:* `scoring.cjs` flags this case when non-factual videos exceed 10% of the ordinary group.
   - Claim coverage is reported alongside.
2. **The C label.** The original displayed label is kept.
   - "Misleading" counts as a correct C only when its explanation establishes a materially false implication of the same claim. Missing evidence, uncertainty or an irrelevant qualification never earns a correct C.
   - When the reference proves a compound claim partly false, a correct C needs a displayed explanation that names the material problem. Matching labels alone are not enough.
   - This is the `explanationValid` field in the scoring input. Misleading needs `true`; contradicted is correct unless it is `false`.
3. **Passing is not readiness.** Passing both gates means "eligible for a scoped private pilot," not public release.
   - Every false contradiction gets a review and a recorded disposition.
   - Any unresolved defect that can repeat a serious false allegation, defeat spending limits or compromise security keeps the pilot on HOLD.
   - A fix does not erase the original error. Changed behavior is validated on fresh cases.
4. **No endless retesting.** The whole-video bootstrap (10,000 draws, Mulberry32 seed 20261121) and the dispute bounds stay.
   - An unreliable interval (more than 5% undefined draws) or a degenerate one (including all-correct) cannot pass.
   - If the result is INCONCLUSIVE, report it and propose one bounded fresh validation set, or a justified alternative interval method, before looking at its outcomes.
   - Never keep adding cases until the threshold is crossed.
5. **Freeze and preserve.** This file, the central-question definitions and the input IDs are saved before further unblinding.
   - Original blind grades are never overwritten; adjudicated labels are appended.
   - The all-literal secondary tally (`refLiteral`) is also reported.
   - Reviewer agreement alone is not proof, so human adjudication and spot-checks remain.

## Pass rule (ordinary group only)
Accuracy:
- **PASS** if the lower bound of the 95% whole-video interval is at least 80%, and the interval is reliable and not degenerate.
- If unresolved firm disputes exist, the conservative lower bound (all disputes counted wrong) must also reach 80%; otherwise the result is INCONCLUSIVE.
- Whether the point estimate reaches 85% is reported, but it is not required.

Usefulness:
- **PASS** if at least 50% of ordinary videos have their central question usefully answered.

The 4 prophecy videos are reported separately, with a small-sample warning. Their factual sub-claims are judged normally. Future or supernatural predictions are U unless independently testable.

## Central factual question (amendment 1 procedure)
- Fred writes one central factual question per video from its title, channel and public content, without seeing AIVerify's answers. For batch 1 he has already seen them, which is disclosed.
- A video with no checkable central fact is marked non-factual, with a reason.
- These definitions are frozen in `EVAL_CENTRAL_QUESTIONS.json` before batches 2–4 are graded.
- During grading, the reviewer marks whether AIVerify's displayed answers usefully answer that question (`centralAnswered`). Cary adjudicates any disagreement.
