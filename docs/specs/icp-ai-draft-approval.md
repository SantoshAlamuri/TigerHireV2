# AI-drafted ICP with an approval step

Status: spec, not built
Date: 2026-09-13
Decisions in this document were made by the operator; open questions are marked as such.

## The problem this solves

Today a requisition approval is a rubber stamp. The approver sees a title, a headcount and a budget, clicks **Approve**, and nothing about who we are actually looking for has been agreed. The hiring bar gets set later and implicitly — by whatever the scoring rubric happens to contain — with no moment where a human says "yes, that is the person."

Meanwhile the ICP (ideal candidate profile) already exists in pieces:

- `hiring_requests.must_haves`, `nice_to_haves`, `ideal_experience`, `ideal_summary` are live in production and structured
- JD Base approval already establishes the pattern of a human signing off on an AI-derived rubric before it scores anyone
- The July ICP redesign work argues for weighting off raw experience and toward outcomes and competencies

So this is not a new system. It is wiring three existing things into one moment.

## The shape

```
requisition submitted
   → AI drafts the ICP from the JD + the ideal-candidate fields
   → the draft appears INSIDE the approval the approver is already doing
   → they edit it or approve it
   → approving the requisition approves the ICP
   → the ICP is what scoring uses
```

Putting the draft inside the existing approval is the point. It costs the approver no extra step, and it converts a click that currently means nothing into a decision about the hiring bar — at the one moment a human is already paying attention.

## Rule 1 — Edit or Approve. There is no Reject.

**Decided.** The ICP panel offers exactly two actions: edit a criterion, or approve the set.

Rejecting an ICP is a meaningless action. The role still exists and still needs a definition, so "reject" would only mean "someone else write it." Disagreement is expressed by **editing**, which is both more specific and more useful than a rejection reason.

This is the ICP step only. **The requisition approval itself keeps Reject** — denying headcount is a real decision with a real outcome, and the two must not be conflated in the UI.

### What makes this safe rather than a rubber stamp

The risk of removing Reject is that Approve becomes the only one-click path and everything gets stamped. The mitigation is that editing has to be as cheap as approving:

- Every criterion is **individually editable and removable**, inline. No modal, no separate edit mode.
- Each criterion shows **which JD line it came from**, so the approver can check it rather than trust it.
- "Edited before approving" is the **expected** path, not the exception — the UI should not treat an untouched draft as the happy path.
- Criteria the model is unsure about are surfaced as **"not sure"**, not as confident assertions. (This is what Ishita asked for directly in the July screening feedback: uncertainty framed as uncertainty.)

If approving is one click and editing is five, we have built a laundering machine: AI guesses acquire human authority without a human ever engaging. The whole value of the step depends on this being false.

## Rule 2 — A JD update auto-edits the ICP. Scoring is forward-only.

**Decided.** When the JD changes, the ICP is regenerated to match. Candidates already scored **keep their existing scores**; only candidates scored after the change are scored against the new ICP.

Rescoring history silently is the wrong behaviour — it would move candidates people have already discussed, compared and made decisions about. A score someone quoted in a meeting should not change underneath them.

### The consequence that must be designed for

Forward-only scoring means **one pipeline will contain candidates scored under different ICP versions**. Two candidates at 72 will not mean the same thing, and nothing on screen would say so. That is calibration drift wearing a new costume, and it is the known failure mode this codebase has already been bitten by.

So forward-only requires, as part of the same work:

1. **A version stamp on every score.** Each score records which ICP version produced it.
2. **Visible provenance in any comparison view.** "Scored under ICP v1, before the JD changed on 13 Sep" next to the number — not buried in a detail panel. If a list sorts by score, the list must show the mixed versions.
3. **An explicit rescore action.** A recruiter who wants a fair comparison can rescore a candidate under the current ICP. Deliberate, per-candidate or per-shortlist, never automatic.
4. **A degraded-path log event** whenever a comparison spans versions, per the repo's correctness conventions.

Without the stamp, forward-only quietly produces a leaderboard that cannot be read. The rule is right; it is not free.

## Open question — does an auto-edited ICP need re-approval?

**Not yet decided. Recommendation: yes, for material changes.**

If a JD edit silently rewrites the ICP, the hiring bar changes with no human agreeing to it — which is exactly the rubber-stamp failure Rule 1 exists to prevent. Approving v1 is not consent to v4.

Recommended shape:

- A **material** change (a must-have added or removed, a weighting shifted past a threshold) puts the ICP back into `needs_approval`. Scoring continues under the last approved version until someone approves the new one, so nothing stalls.
- A **cosmetic** change (rewording that leaves criteria and weights intact) does not.
- The approver sees a **diff**, not a fresh wall of text. "Two must-haves added, one removed" is reviewable; a regenerated page is not.

There is prior art to be careful of here: editing a JD already resets approval and blocks scoring, which bit Masai's first upload batch. Whatever we choose must **not** stall scoring while re-approval is pending — hence scoring continuing on the last approved version above.

## What this does not change

- The requisition approval chain, its roles or its SLAs
- Existing scores, ever, without an explicit human action
- The JD Base approval flow, which keeps working as it does today

## Build order

1. ICP version table with the approval state and the diff basis — nothing else works without versioning
2. Draft generation from JD + ideal-candidate fields, with per-criterion JD provenance
3. The approval panel inside the requisition approval: inline edit, remove, "not sure" framing, Approve
4. Score version stamping + provenance in comparison views + the explicit rescore action
5. JD-change regeneration, material-vs-cosmetic classification, and the re-approval diff (pending the open question)

Steps 1 and 4 are the ones that are painful to retrofit. They should not be deferred to "later" — a scoring table without a version column is the thing that makes all of this unreadable a month in.
