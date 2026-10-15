# TigerHire visual design audit

Date: 13 September 2026  
Scope: recruiter, leadership and platform-admin workspace color, type, contrast, spacing, status communication and component consistency.  
Audit only: no product CSS, components, settings or themes changed. Platform admins do not post jobs.

## Recommendation

Keep TigerHire's amber identity and current font. Improve the workspace through disciplined hierarchy, readable text, fewer competing surfaces and a consistent component system. The main defect is not an unattractive brand color; it is that color, emphasis and spacing do not reliably communicate importance or state.

My proposed direction is a neutral light workspace with restrained amber actions, with an equally readable optional dark theme. This is a design proposal to validate with users, not a claim that light mode is universally better. Repairing the existing dark theme is valuable regardless of that choice. Do not turn theme switching into a dependency for repairing the hiring flow.

The long Requisition → JD → Hiring requirements → Evaluation → Publish journey remains the main workflow priority. Visual improvements should support that flow rather than add more cards, animations or screens.

## Method and limits

Reviewed the current live Jobs screen and the live admin, job setup, intake and application-review screenshots from this conversation. The live session is platform admin; shared hiring pages were accessible, but recruiter/leadership shells were also evaluated in code rather than separate role logins. Read global styles and shared components. Counted patterns in TSX files under recruiter, company, admin and dashboard components. Those counts include legacy and conditional screens; they are maintenance indicators, not counts of proven live accessibility failures.

Computed sRGB contrast from declared colors and alpha compositing on the standard `#1A1C22` card. These are representative token calculations, not an exhaustive browser-computed-style accessibility certification. Different backgrounds, overlays, parent opacity and states require their own checks.

## What already works

- Amber `#F59E0B` with black button text is distinctive and has approximately 9.78:1 contrast.
- The primary/secondary/subtle text tokens are reasonably separated on the standard dark card: approximately 15.04:1, 8.64:1 and 5.47:1 respectively.
- Semantic success/info/warning/danger/neutral tokens, a `StatusBadge`, a `Button`, a focus-ring utility and a radius scale already exist.
- Plus Jakarta Sans is consistently configured as the primary family. A font replacement is not the highest-value change.
- `PageHeader` already standardizes a number of title/layout choices. The prior extra v2 navigation rail is already removed.
- Solid modal/card backgrounds and contrast-preference support are not wholly absent: solid `--card` and `prefers-contrast: more` overrides exist. The latter is increased-contrast support; it does not fix hard-coded low-opacity text across all screens.

Sources: [global styles](/Users/santoshalamuri/TigerHire/TigerHire/src/app/globals.css), [Button](/Users/santoshalamuri/TigerHire/TigerHire/src/components/ui/Button.tsx), [StatusBadge](/Users/santoshalamuri/TigerHire/TigerHire/src/components/ui/StatusBadge.tsx), [PageHeader](/Users/santoshalamuri/TigerHire/TigerHire/src/components/dashboard/PageHeader.tsx), [font configuration](/Users/santoshalamuri/TigerHire/TigerHire/src/app/layout.tsx).

## Findings

### V01 — Many important labels bypass the readable text tokens

**Priority: P1.** A static scan found 353 occurrences of `text-white/20` through `/45` across 99 scoped TSX files. The live Jobs screen has faint helper text and small pipeline labels. These are often real information, not disabled controls.

| White foreground opacity on #1A1C22 | Approximate contrast | Normal-text assessment for this pairing |
| ----------------------------------- | -------------------: | --------------------------------------- |
| 25%                                 |               2.28:1 | Below 4.5:1                             |
| 35%                                 |               3.22:1 | Below 4.5:1                             |
| 40%                                 |               3.79:1 | Below 4.5:1                             |
| 45%                                 |               4.44:1 | Below 4.5:1                             |
| 50%                                 |               5.17:1 | Above 4.5:1                             |
| Existing --text-subtle              |               5.47:1 | Above 4.5:1                             |

**Change:** essential labels, values, helper text and timestamps should use tested semantic foreground tokens. Avoid opacity as the primary hierarchy tool. Keep de-emphasis through position, weight and spacing. A disabled control and a candidate count of zero are different states: zero is still information users must read.

Normal text generally needs at least 4.5:1; qualifying large text needs 3:1, with defined exceptions such as inactive controls. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

### V02 — Amber does too many jobs

**Priority: P1.** Amber appears as brand accent, primary action, active selection, warning background, readiness/progress and a favorable score band. Those meanings are difficult to distinguish at a glance.

**Change:** reserve filled amber for the primary workflow action. Navigation selection should be a restrained underline or neutral selected surface. Warnings should have a warning icon, explicit message and a labelled state. Use a distinct blue information treatment for waiting or progress; use neutral for draft, green for verified completion and red for genuine errors. Do not make every task requiring attention look like an error.

Color must accompany text or another cue; it should not be the only way to identify a state. [W3C use-of-color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

### V03 — Score color is not consistently tied to the same meaning

**Priority: P1.** `FitRing` uses `scoreToTone`, while the candidate list renders any nonzero non-fallback score in emerald. Separate band logic also exists in `score-display.ts`, which can use persisted job-specific bands. A number can therefore look encouraging in a list and weak in another display.

**Change:** use the stored, role-specific evaluated band as the common presentation input where available; define an explicit fallback for older records. Keep numeric score, text band and color aligned. Distinguish zero from not scored, and fallback/processing from a final score. Prefer neutral numbers with a small labelled band to large glowing green rings. This recommendation changes presentation consistency, not candidate scores or hiring decisions.

Sources: [candidate list colors](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/candidates/page.tsx:226>), [score-tone helper](/Users/santoshalamuri/TigerHire/TigerHire/src/lib/score-tone.ts), [band presentation](/Users/santoshalamuri/TigerHire/TigerHire/src/lib/v2/score-display.ts), [FitRing](/Users/santoshalamuri/TigerHire/TigerHire/src/components/ui/FitRing.tsx).

### V04 — Too much framing makes sparse screens feel busy

**Priority: P2.** The live Jobs page repeats posted-job counts in the subtitle, a large summary card and the list header. It also showed an empty outlined summary region. Admin overview repeats its top attention cards in large panels below. Multiple borders, shadows and nested surfaces consume space without clarifying the task.

**Change:** retain a compact title/action row, optional single-line summary and the actual work list. Use a surface only to group a distinct task. Use dividers or whitespace inside a surface instead of cards within cards. Empty sections should collapse or offer a meaningful action, not reserve a blank rectangle.

Sources: [Jobs page](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/jobs/page.tsx>), [admin overview](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/admin/page.tsx>).

### V05 — Type is simultaneously oversized in containers and undersized in content

**Priority: P1/P2.** The scan found 390 explicit 10–11px utilities across 115 files, plus 1,221 `text-xs` occurrences across 206 files. Global `text-caption` is 10px and `text-label` is 11px at the default root size. Large card padding does not compensate for faint tiny text.

**Change:** use 14–16px for ordinary form/list content; 13–14px for meaningful labels; 12px for secondary metadata only. A 22–24px page title and 16–18px section title are sufficient. Use sentence case for most labels; reserve compact uppercase labels for rare overlines. Keep line height around 1.45–1.6 for work screens, with more room for long documents.

These sizes are proposed design defaults, not a claim that WCAG mandates a particular minimum font size. Reduce extra sections and spacing to shorten pages; do not reduce readability to fit more content.

### V06 — Button and control styles drift across screens

**Priority: P2.** Shared `Button` defines an 8px radius, but raw controls often use pills or other corner styles. In the scoped scan, there were 444 `rounded-full`, 285 `rounded-md` and 448 `rounded-lg` occurrences. Those utilities include non-buttons, so these are drift indicators rather than exact button counts. Only one file in this scoped scan directly imported the shared Button module.

**Change:** one action specification: primary, secondary, quiet and destructive; consistent heights, padding, focus and loading states. Prefer 8px control radius, 12px panels, pills for compact statuses. Allow a consistent selected navigation style. Never make a status badge look like a button unless it is actually interactive.

### V07 — Inputs and focus states need stronger, consistent affordances

**Priority: P1.** Input boundaries use subtle white alpha borders; some forms override the shared amber focus with a white translucent ring. Not every pale border is a compliance failure—labels and other visual cues matter—but relying on faint borders makes fields and focus difficult to scan.

**Change:** define separate decorative-divider and control-boundary tokens. Use visible labels, required/optional hints, inline validation and a consistent focus indicator. Check focus on both the surrounding surface and the control itself. Required visual information identifying components or their states generally needs 3:1 against adjacent colors. [W3C non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Source: [role-intake input styles](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/company/hiring-requests/new/page.tsx:10>).

### V08 — Dark mode is effectively baked into components

**Priority: P2.** Global controls use `color-scheme: dark`; many components use white text, white alpha fills and literal dark surfaces. No implemented user theme selector or full light-theme token set was found in the inspected source searches.

**Change:** if light mode is adopted, migrate semantic tokens and native form-control styles as one system. Do not just flip `--bg`; charts, inputs, scores, dropdowns and disabled states must also adapt. Offer a saved user preference and system preference if both themes ship. All roles should use the same palette vocabulary.

### V09 — Decorative glow is competing with work content

**Priority: P2.** Dashboard ambient amber gradients, inset highlights and some score glows add layers to screens already containing colored status panels. The CSS explicitly contains multiple glow families. These are not proven latency causes in this audit.

**Change:** keep richer visual effects on marketing surfaces. Use flat, stable work surfaces, subtle separators and very restrained shadows for raised menus/dialogs. Profile blur/painting before attributing overall slowness to decorative effects. Removing expensive data requests remains a separate performance priority.

Source: [ambient styles](/Users/santoshalamuri/TigerHire/TigerHire/src/app/globals.css:712).

### V10 — Interruptions and unclear states weaken the design hierarchy

**Priority: P1/P2.** The high-contrast white install prompt is more conspicuous than many work actions and repeatedly overlaps the lower-right workspace. Missing evidence can look like positive evidence, and approved setup can still look unfinished, as documented in the workflow audit.

**Change:** suppress promotion during setup and review; use compact, dismissible notifications for actual work results. Design coherent loading, empty, error, disabled, approved and published states—not only ideal populated screens. Pair each blocker with its exact resolution and owner. A beautiful status chip cannot compensate for a false state.

## Proposed palette

Suggested starting values below are design specifications, not changes already made. Verify all actual foreground/background combinations, hover/focus states and overlays before shipping.

| Purpose                  | Proposed light workspace | Refined dark workspace | Usage                                                  |
| ------------------------ | ------------------------ | ---------------------- | ------------------------------------------------------ |
| Page background          | #F8FAFC                  | #0F1014                | Quiet canvas                                           |
| Main work surface        | #FFFFFF                  | #1A1C22                | Form, candidate review, dialog                         |
| Secondary surface        | #F1F5F9                  | #222630                | Read-only grouping, hover/selection                    |
| Primary text             | #0F172A                  | #EEF1F6                | Titles, candidate names, values                        |
| Secondary text           | #475569                  | #AEB9D0                | Labels and supporting content                          |
| Muted text               | #64748B                  | #8493AC                | Timestamps and nonessential metadata                   |
| Decorative divider       | #E2E8F0                  | #353A46                | Section/table separation, not sole control boundary    |
| Control boundary         | #64748B                  | #8493AC                | Where a visible field boundary is required             |
| Primary button fill      | #F59E0B                  | #F59E0B                | Main Continue/Publish/Save action                      |
| Primary button text      | #000000                  | #000000                | Approximately 9.78:1 on brand amber                    |
| Brand-colored text       | #9A5800                  | #FBBF24                | Small links/accents, verified on actual surface        |
| Informational foreground | #1D4ED8                  | #93C5FD                | Processing, awaiting response                          |
| Successful foreground    | #166534                  | #86EFAC                | Verified completion                                    |
| Warning foreground       | #92400E                  | #FCD34D                | Needs attention, accompanied by icon and label         |
| Error foreground         | #B91C1C                  | #FCA5A5                | Failed operation/validation, accompanied by resolution |

White on the existing amber calculates to only about 2.15:1. The current shared primary button correctly uses black; preserve that pairing. For light mode, amber text itself needs a darker text variant rather than reusing the button fill color as small text.

Status backgrounds should be pale, theme-specific tints with verified foreground pairings. Do not use saturated full-width green/red panels for routine statuses. Keep warning and brand contexts distinguishable by icon, label, placement and fill treatment.

## Component and layout specification

- **Spacing:** a 4px base scale; use 8/12px within compact controls, 16px within content groups, 24px between major groups. Avoid repeated 24px padding at every nesting level.
- **Forms:** stable content width around 720–840px for short inputs; a wider document editor only when required. One decision stage at a time, visible action bar, explicit save state.
- **Tables:** readable text, 44–52px starting row-height target, clear header and row selection; fewer initial columns and details on demand. Targets must adapt to device/input rather than squeezing text.
- **Candidate review:** queue and selected candidate; persistent action bar; compact score/label; resume and detailed evidence on demand. Color never substitutes for the decision rationale.
- **Progress:** completed steps have checks, current step has a clear label and emphasis, future steps remain readable. Error uses an icon/message and returns to the affected field.
- **Navigation:** understated current-tab underline/selection. A single filled main action within each active workflow region. Secondary actions remain neutral.
- **Icons:** one existing icon family, consistent sizes and strokes. Label unfamiliar actions. Do not communicate success/error using icon color alone.
- **Motion:** short state transitions; no repeated decorative movement in core workspaces. Honor reduced motion. Keep loading feedback immediate and content geometry stable.

## Screen-specific application

| Screen                                             | Design change                                                                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request → JD → requirements → evaluation → publish | Same shell, short active step, dark readable labels or proper dark-theme text, persistent primary action; no full-page stack of completed sections |
| Recruiter Jobs                                     | Compact header and filters, clear Draft/Published badges, readable job rows, one meaningful next action per job; remove repeated count card        |
| Candidate submissions                              | Neutral rows with clear stage and processing labels; restrained score band; upload action clearly visible                                          |
| Candidate review                                   | Keep candidate identity and decisions visible; simplify the top comparison block; evidence colors only as secondary cues                           |
| Leadership approvals                               | One concise decision summary, budget/headcount/owner, approval action and clear waiting state; do not expose configuration jargon                  |
| Platform admin                                     | Compact exception list and focused company detail; move engineering diagnostics out of business summaries; retain separate System health           |

## Implementation order proposed by the audit

1. Fix meaningful-text contrast and misleading score/status coloring, including missing/zero/fallback states.
2. Standardize shared action, input, badge, typography and focus primitives across the canonical screens selected by the route audit.
3. Apply the guided request-to-publication layout and persistent action areas; reduce duplicated surfaces.
4. Validate light-workspace and refined-dark prototypes with recruiters and leadership. Choose default based on those sessions rather than an aesthetic assumption.
5. Add full theme support only after component token adoption; verify all states and chart/form controls.
6. Measure readability, task completion, scrolling, errors and speed—not just visual preference.

## Verification criteria

- Normal meaningful text meets the applicable 4.5:1 criterion on its actual surface; large text and non-text components are assessed under their relevant criteria and exceptions.
- Status and selection remain understandable in grayscale and with common color-vision deficiencies.
- Focus is visible; keyboard navigation works through forms, menus and dialogs; actionable content does not depend on hover.
- 200% zoom, standard laptop viewports and narrow layouts retain labels, controls and primary actions without clipping.
- Draft, loading, failed, empty, saved, awaiting approval and published states are reviewed in both themes if both are offered.
- A low score does not become green merely because it is nonzero. Unknown is not styled or labelled as zero.
- Completed setup does not create long daily work pages; no extra cosmetic cards are introduced to replace removed ones.
- No claim of accessibility conformance or performance improvement is made until rendered-state testing and measurements are completed.

Related: [hiring workflow, speed and route audit](/Users/santoshalamuri/TigerHire/TigerHire/docs/audits/2026-09-13-hiring-ui-speed-route-audit.md).
