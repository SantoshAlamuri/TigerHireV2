# GTM: Native signing, job alerts, and application inbox

**Purpose:** One place for **sales, solutions, and support** to align on what the **repository** ships vs common ATS language (DocuSign, “unified inbox,” “digest”).

**See also:** [Feature inventory — offers](../requirements/FEATURE-INVENTORY-LIVING.md#10-offers-draft--approval--send--signing), [§4 applications](../requirements/FEATURE-INVENTORY-LIVING.md#4-applications--apply), [§20 job alerts](../requirements/FEATURE-INVENTORY-LIVING.md#20-saved-searches--job-alerts).

## Native offer signing vs third-party e-sign

- **Shipped (default):** In-product offer **view**, **OTP**, **accept/decline**, **native signing** pipeline, **audit** events, and internal **signed download** — see [feature inventory — §10 offers](../requirements/FEATURE-INVENTORY-LIVING.md#10-offers-draft--approval--send--signing); code under `src/lib/offers/`, public `offers/[token]`, `src/app/api/offers/`.
- **Not the default in-repo path:** A **separate** DocuSign- or Docusign-class **vendor** integration as the primary signing surface. If an enterprise RFP _requires_ that, treat it as a **dedicated program** (contract + engineering spike), not “already included.”
- **Customer line:** “TigerHire’s default is native candidate signing and audit. Third-party e-sign is out of our standard product story unless you’ve signed a addendum for it.”

## Job alerts vs profile digest

- **Shipped today:** A **scheduled job-alerts** cron and saved-search surfaces — see [feature inventory — §20](../requirements/FEATURE-INVENTORY-LIVING.md#20-saved-searches--job-alerts) and cron list in the same file.
- **Not interchangeable:** Some **PRD** or competitor language may describe a **profile / digest** email (broader, candidate-centric) that is **not** the same as “alert me for jobs matching X.”
- **Customer / deck line:** “We have **email job alerts** tied to saved job criteria in product; a separate **full profile digest** product, if in your PRD, is a distinct scope — confirm in [FEATURE-INVENTORY-LIVING.md](../requirements/FEATURE-INVENTORY-LIVING.md#20-saved-searches--job-alerts).”
- **Engineering:** Don’t conflate the two in backlog; if you add a digest, add a **new row** and a **new cron** name in the feature inventory.

## Unified application inbox (email parser)

- **Not shipped** as a single, named “unified application inbox for every email channel” module in the sense many enterprise **ATS RFPs** use.
- **In-repo** application paths include **public apply**, **APIs**, and **channel-specific** work (e.g. WhatsApp bridge, email intake pieces where present). Gaps are tracked in **PRD F1 / intake**-style backlogs; see [ATS-EPICS-BACKLOG.md](../requirements/ATS-EPICS-BACKLOG.md) and [ATS-PARTIAL-GAPS-BACKLOG.md](../requirements/ATS-PARTIAL-GAPS-BACKLOG.md).
- **Explicit defer / roadmap line:** “Multi-channel, fully unified _email parser_ as one SKU is a **larger** initiative — not a checkbox we claim without a gap review.” Prefer logging an epic with **exit criteria** (which channels, SLAs) rather than a vague “inbox = done.”
