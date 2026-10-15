# Marketing primitives (Stage 5)

Marketing extends the alive system with louder atmospheres, larger type, and bigger shadows - same palette, bigger feel.

## Type

- `.heading-display` - hero headlines (use with `text-6xl md:text-8xl lg:text-9xl`)
- `.heading-display-light` - paired thin voice for emphasis splits
- Body lead: `text-xl text-white/70 leading-relaxed`

## Atmosphere

- `.alive-air-hero` - page-level marketing atmosphere (use on the main wrapper of marketing routes)
- `.alive-halo-lg` - large amber halo behind hero illustrations or signature moments

## CTAs

- Dashboard CTA: `bg-[var(--accent)] text-black + .cta-bloom`
- Marketing hero CTA: `bg-[var(--accent)] text-black + .cta-bloom-lg`

## Cards

- Dashboard card: `.card-lifted` + optional `.card-lifted-hover`
- Marketing card: `.card-lifted-marketing` + optional `.card-lifted-marketing-hover`
  - Difference: marketing has larger shadow, larger radius (16px vs 12px), warmer inner highlight, hover lifts `-2px`.

## Utility audit (Stage 5.0)

- `.heading-hero`: **EXTEND** - keep for existing pages; new hero rebuilds should use `.heading-display`.
- `.mesh-orb` + `.mesh-orb-1/2/3`: **KEEP** - already aligned with alive atmospherics.
- `.animate-fade-up` + stagger variants: **KEEP** - reusable motion primitive; still valid in Stage 5.
- `.hover-lift`: **EXTEND** - keep as generic motion helper; marketing uses `.card-lifted-marketing-hover` and `.cta-bloom-lg` for stronger presence.
- `.card-hover`: **DEPRECATED** - use `.card-lifted-marketing` + `.card-lifted-marketing-hover` for new marketing surfaces.
- `.badge-accent`: **DEPRECATED** - use semantic status badges or neutral/informational chip patterns in new marketing work.

## Deprecated (do not use in new code)

- `.card-hover`
- `.badge-accent`

## Reduced motion

All marketing animations respect `prefers-reduced-motion` via the existing globals.css guard.
