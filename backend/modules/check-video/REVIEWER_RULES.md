# Check Video: shared reviewer rules

Cary asked on November 23, 2026 that every reviewer (Fred, Bob and Grok) work from the same rules, so their answers can be compared without telling them any facts. Each review file starts with this text, word for word. The review files hold only claims, video links, dates and (for safety reviews) AIVerify's finding. They never hold the answer.

---

REVIEWER RULES (the same for every reviewer)

Who we are: AIVerify is a tool that checks YouTube videos. It writes down the video's main claim, and up to 3 other separate claims, and checks each one against public sources. You are one of several independent reviewers. Your answers are compared with AIVerify's and with the other reviewers'. Where they differ, a person decides.

Today's date: {TODAY}. Events up to today are real, even if they are after your training data. Search the web for them; do not answer "not confirmed" only because an event is recent.

Settings: use your most careful research mode (for Grok: Expert, not Fast). Open the sources yourself. Do not guess from memory.

For each claim, judge it AS OF THE VIDEO'S PUBLISH DATE:
- "backed": every material part is established by reliable sources.
- "shown_false": a reliable source about the same thing shows a material part is wrong.
- "not_established": the sources do not settle every material part. A failed search is not proof either way.

Material parts: each person, group, role, action, number, date, place, cause, comparison, and absolute word ("only", "the one", "first", "most", "all", "never"), judged as stated. Wording that does not change the meaning is not a part.

Rules:
1. Absolute or sweeping words need a source that states them as its own finding, not a quote of someone saying it.
2. A claim about a broad group needs a source about that same whole group, not a smaller group within it.
3. A source about the same study or event that shows a different result shows the claim false. A figure for a different year, group or measure leaves it "not_established".
4. A status, ranking, classification or current count must be current at the publish date. A later change counts only if it happened before the publish date.
5. Forecasts: later outcomes never decide. A claim that someone SAID something is judged on whether they said it, not on whether it was true.
6. Relative time ("yesterday", "N years ago") is measured from an unknown recording date up to the publish date.
7. Only what the video said can be judged. If the claim as written adds a detail the video's words do not say, answer on the video's words and say so in your note.
8. Source order: the governing record or primary source first (the agency, the study, the law, the official data), then reliable reporting. Copies of the same wire story are one source.

Answer format: JSON only, in ONE code block (or as the file named in your task). Each note is one sentence, and must include the link to the source that decided your answer.
If you run low on capacity, finish whole items and say where you stopped.

---
