# Marketing Copy Revision Plan

A targeted edit pass on the public marketing pages to fix three issues:

1. **Hero bloat** on the home page (4 stacked text blocks before the CTA, 22-word jargon line)
2. **Synonym soup** (the same idea — "one approved bar" — is rephrased 7+ times across pages)
3. **Spacing inconsistency** (home uses `py-24`–`py-40`; every other page uses `py-14 md:py-20`)

Each edit is independent — Cursor can apply phases in any order. Phase 1 has the highest impact-to-risk ratio; do it first if you only want to do one.

## Files in scope

- `src/app/(public)/page.tsx` (home)
- `src/app/(public)/companies/page.tsx`
- `src/app/(public)/agencies/page.tsx`
- `src/app/(public)/product/page.tsx`

No imports change. No components are added or removed. Pure copy + Tailwind class swaps.

---

## Phase 1 — Tighten the home hero

**Goal:** The hero currently has 4 stacked text blocks (h1 + "Not just who applied." + 22-word paragraph + 27-word secondary paragraph) before the CTA. That kills the punch from the strong headline. Cut to 3 blocks and shorten the subhead.

### Edit 1.1 — Replace hero subhead with one tight line

**File:** `src/app/(public)/page.tsx` lines **63–70**

**Replace:**

```tsx
            <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-white/65 md:text-2xl animate-fade-up animate-fade-up-3">
              Standardise hiring decisions with one approved bar, explainable evidence, and a clear
              operating trail from intake to final verdict.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-base text-white/55 animate-fade-up animate-fade-up-3">
              Post a job, keep candidates in the loop on WhatsApp, and send a signable offer in one
              place — from application to hire.
            </p>
```

**With:**

```tsx
<p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-white/65 md:text-2xl animate-fade-up animate-fade-up-3">
  One approved bar. Every score explained. From job post to signed offer in one place.
</p>
```

**Why:** 49 words → 14. Three crisp clauses preserve the three pillars (governance, explainability, end-to-end). Both paragraphs were saying the same thing in different words.

### Edit 1.2 — Sharpen the "Why teams choose" subhead

**File:** `src/app/(public)/page.tsx` lines **308–312**

**Replace:**

```tsx
<h2 className="heading-display mt-4 text-4xl md:text-5xl lg:text-6xl">
  <span className="heading-display-light text-white/60">Decisions your team can defend.</span>
  <br className="hidden sm:block" />
  <span className="text-white">Speed your leadership can feel.</span>
</h2>
```

**With:**

```tsx
<h2 className="heading-display mt-4 text-4xl md:text-5xl lg:text-6xl">
  <span className="heading-display-light text-white/60">The discipline of a board review.</span>
  <br className="hidden sm:block" />
  <span className="text-white">The pace of a startup.</span>
</h2>
```

**Why:** "Speed your leadership can feel" is awkward — "feel" is a weak verb here. The replacement is parallel, concrete, and frames the actual tension (rigour vs. speed) better than "defend / feel."

### Edit 1.3 — Differentiate the two "Book a walkthrough" CTAs

**File:** `src/app/(public)/page.tsx` line **448**

**Replace:**

```tsx
                Book a live walkthrough
```

**With:**

```tsx
                Talk to our team
```

**Why:** The hero CTA at line 77 already says "Book executive walkthrough." Repeating "Book a walkthrough" near the bottom of the page is a missed chance for variety. "Talk to our team" reads warmer for the closing CTA.

---

## Phase 2 — Kill the synonym soup

The same concept is renamed across pages. Pick one canonical phrase per concept and use it everywhere.

### Canonical vocabulary

| Concept                  | Use this                          | Retire these                                                                            |
| ------------------------ | --------------------------------- | --------------------------------------------------------------------------------------- |
| Shared scoring framework | **one approved bar**              | one approved standard, one agreed standard, one operating view, one rubric              |
| Why a score holds up     | **explainable**                   | plain-English (limit to one use), defensible (limit to one use per page)                |
| End-to-end claim         | **from job post to signed offer** | from job post to hiring verdict, from intake to final verdict, from application to hire |

### Edit 2.1 — Companies subhead (35 words → 17)

**File:** `src/app/(public)/companies/page.tsx` lines **77–81**

**Replace:**

```tsx
<p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--text-muted)] md:text-xl animate-fade-up animate-fade-up-3">
  Set one approved hiring standard before screening begins. Every CV is evaluated against the same
  explainable framework, so TA and leadership can move quickly without compromising decision
  quality.
</p>
```

**With:**

```tsx
<p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--text-muted)] md:text-xl animate-fade-up animate-fade-up-3">
  Set the bar before screening starts. Every candidate is judged against one explainable framework —
  so TA and leadership move faster without giving up rigour.
</p>
```

**Why:** Cuts the word count by half. "Set the bar" is sharper than "set one approved hiring standard." Keeps the three claims (up-front, explainable, speed without sacrifice).

### Edit 2.2 — Companies narrative paragraph

**File:** `src/app/(public)/companies/page.tsx` lines **106–110**

**Replace:**

```tsx
<p className="text-center text-[0.95rem] leading-relaxed text-[var(--text-muted)] md:text-base">
  Boards expect both hiring speed and hiring discipline. Black-box matching does not hold up under
  review. You need approved criteria, explainable outcomes, and one operating view that does not
  depend on individual recruiter interpretation.
</p>
```

**With:**

```tsx
<p className="text-center text-[0.95rem] leading-relaxed text-[var(--text-muted)] md:text-base">
  Boards want hiring that's fast and disciplined. Black-box matching can't survive a review. What
  holds up: approved criteria, explainable outcomes, and a single operating picture that doesn't
  ride on one recruiter's judgment.
</p>
```

**Why:** "Does not hold up under review" is corporate-stiff; "can't survive a review" lands harder. "What holds up: …" sets up the three pillars more punchily than "You need …".

### Edit 2.3 — Agencies subhead (40 words → 26)

**File:** `src/app/(public)/agencies/page.tsx` lines **75–80**

**Replace:**

```tsx
<p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--text-muted)] md:text-xl animate-fade-up animate-fade-up-3">
  You know the client&apos;s needs better than their JD says. TigerHire lets you define the right
  scoring criteria, generate an ideal candidate profile, and secure client approval before
  screening. Then every submission is assessed against one agreed standard.
</p>
```

**With:**

```tsx
<p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--text-muted)] md:text-xl animate-fade-up animate-fade-up-3">
  You know the client&apos;s needs better than their JD does. Define the scoring criteria, lock
  client approval up front, and submit against one approved bar.
</p>
```

**Why:** "Better than their JD does" beats "than their JD says" — it's the JD that's the failed artifact. "Lock client approval up front" is more active than "secure client approval before screening." Adopts canonical phrase "one approved bar."

### Edit 2.4 — Agencies workflow heading

**File:** `src/app/(public)/agencies/page.tsx` line **109**

**Replace:**

```tsx
              From JD to defensible shortlist in five steps
```

**With:**

```tsx
              From JD to a shortlist your client will trust
```

**Why:** "Defensible" is overused across the site. "A shortlist your client will trust" speaks to the agency's actual buyer (the client) instead of an abstract quality.

### Edit 2.5 — Product hero gradient line

**File:** `src/app/(public)/product/page.tsx` lines **107–113**

**Replace:**

```tsx
<h1 className="heading-hero mt-6 text-[2.5rem] text-[var(--text)] sm:text-5xl md:text-6xl animate-fade-up animate-fade-up-2">
  One platform.
  <br />
  <span className="bg-gradient-to-r from-[var(--accent)] via-amber-400 to-orange-400 bg-clip-text text-transparent">
    From job post to hiring verdict.
  </span>
</h1>
```

**With:**

```tsx
<h1 className="heading-hero mt-6 text-[2.5rem] text-[var(--text)] sm:text-5xl md:text-6xl animate-fade-up animate-fade-up-2">
  One platform.
  <br />
  <span className="bg-gradient-to-r from-[var(--accent)] via-amber-400 to-orange-400 bg-clip-text text-transparent">
    From application to signed offer.
  </span>
</h1>
```

**Why:** "From job post to hiring verdict" is also used as the home page section H2 at `page.tsx:196`. Two pages should not share a near-identical hero line. The product page is more concrete with "application to signed offer" since the platform's end state is a signed offer.

### Edit 2.6 — Remove duplicate "plain-English"

**File:** `src/app/(public)/page.tsx` line **220**

**Replace:**

```tsx
description =
  "Evaluate candidates against one rubric, with role-level rationale and confidence signals.";
```

**With:**

```tsx
description =
  "Every candidate scored against the same approved bar — with role-level rationale and confidence signals.";
```

**Why:** "Plain-English" appears twice on the home page (this line and line 327). Keep it only at line 327 ("Plain-English rationale on every candidate") where it's load-bearing. Also retires "rubric" in favour of canonical "approved bar."

---

## Phase 3 — Spacing pass on home

Every other public page uses `py-14 md:py-20` for content sections and `pt-24 pb-12 md:pt-32 md:pb-18` for hero. The home page uses `py-24` and `py-32` and `py-40`, making it feel sparse relative to the rest of the site.

**Goal:** Pull home into the same rhythm — slightly more generous than subpages (it's the front door) but not double.

### Edit 3.1 — Hero padding

**File:** `src/app/(public)/page.tsx` line **38**

**Replace:**

```tsx
        <section className="relative overflow-hidden px-5 py-32 lg:px-8 lg:py-40">
```

**With:**

```tsx
        <section className="relative overflow-hidden px-5 pt-28 pb-20 lg:px-8 lg:pt-36 lg:pb-24">
```

**Why:** Asymmetric top/bottom padding — generous breathing room above the headline, then less below so the eye flows into the next section. Net reduction: ~96px on desktop.

### Edit 3.2 — Standardise content section padding

Apply this Tailwind class change to **each** of these `<section>` opening tags:

| Line | Find            | Replace with             |
| ---- | --------------- | ------------------------ |
| 131  | `py-24 lg:px-8` | `py-20 md:py-24 lg:px-8` |
| 156  | `py-32 lg:px-8` | `py-20 md:py-24 lg:px-8` |
| 188  | `py-24 lg:px-8` | `py-20 md:py-24 lg:px-8` |
| 236  | `py-24 lg:px-8` | `py-20 md:py-24 lg:px-8` |
| 302  | `py-24 lg:px-8` | `py-20 md:py-24 lg:px-8` |
| 360  | `py-24 lg:px-8` | `py-20 md:py-24 lg:px-8` |
| 420  | `py-24 lg:px-8` | `py-20 md:py-24 lg:px-8` |

**Why:** Mobile gets `py-20` (a touch tighter), desktop stays at `py-24`. Reduces the home page total height by ~100px on mobile and aligns vertical rhythm with subpages.

---

## Acceptance checks

After applying, walk through the site and confirm:

- [ ] **Home hero** fits a 13" laptop viewport with the CTAs visible without scrolling (or one short scroll).
- [ ] **No phrase appears twice** in the home hero, "Why teams choose," or any subpage hero.
- [ ] **"One approved bar"** is the only phrase used for the shared scoring framework concept (search the four files).
- [ ] **"From job post to hiring verdict"** appears at most once across the four files.
- [ ] **"Defensible / defend"** appears no more than once per page.
- [ ] **"Plain-English"** appears only at `page.tsx:327`.
- [ ] **All home `<section>` py-\* classes** match `py-20 md:py-24`, except the hero.
- [ ] **No layout breakage** at 360px, 768px, 1024px, 1440px.

## Out of scope (intentionally)

- Pricing, About, Blog, and other (public)/\* pages — same audit pattern applies but not addressed here. Apply Phase 1 + 2 first, see how the tone shifts, then audit those.
- The `JdIntelligenceAgentSection`, `ReferEarnMarketingSection`, `HomeClosingSection` components — these are shared and changing them affects multiple pages. Audit separately.
- SEO metadata — current keywords and descriptions are fine; copy changes here don't require meta updates.
