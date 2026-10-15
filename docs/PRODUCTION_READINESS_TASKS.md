# TigerHire Production Readiness Task List

> **SUPERSEDED (2026-07-08).** This document is a historical snapshot; its dates,
> task states, and flag references are no longer accurate. Current status:
> [`docs/ops/STATUS-2026-07-08.md`](ops/STATUS-2026-07-08.md) · launch
> decision: [`docs/launch/GO-NO-GO-JUN-2026.md`](launch/GO-NO-GO-JUN-2026.md).

Generated from audit: Feb 23, 2026. Target launch: Apr 2, 2026.

---

## HIGH Priority — Must Fix Before Launch

- [ ] **1. Organization approval workflow** — Build admin UI to approve/reject agencies (schema supports it). _Effort: 1–2 days_
- [ ] **2. Complete privacy policy & ToS** — Replace placeholder content with full legal text. _Effort: 1 day_
- [ ] **3. SEO metadata for all pages** — Add `generateMetadata`, Open Graph, Twitter Cards. _Effort: 1 day_
- [ ] **4. Rate limiting on expensive endpoints** — Apply to FitScore POST, resume upload, scraping. _Effort: 1 day_
- [ ] **5. Email notifications for key events** — Application updates, interview reminders, shortlist. _Effort: 2–3 days_
- [ ] **6. E2E tests for critical flows** — Apply flow, job creation, fit score viewing. _Effort: 2–3 days_
- [ ] **7. Cache metrics and monitoring** — Add cache hit/miss tracking. _Effort: 1 day_
- [ ] **8. Sentry integration across all routes** — Use `reportError()` or Sentry capture in all API routes. _Effort: 1 day_

---

## MEDIUM Priority — Should Fix Before/Soon After Launch

- [ ] **9. Job search/browse for candidates** — Dedicated `/candidate/jobs` page with filters. _Effort: 3–4 days_
- [ ] **10. Calendar integration** — Google/Outlook for interview scheduling. _Effort: 2–3 days_
- [ ] **11. Notification UI for candidates** — Bell icon, preferences page. _Effort: 2 days_
- [ ] **12. Admin billing dashboard** — View all org subscriptions, revenue. _Effort: 2 days_
- [ ] **13. React component tests** — Add 20+ tests for critical dashboard/marketing components. _Effort: 3 days_
- [ ] **14. Bulk operations for recruiters** — Bulk shortlist/reject in applications. _Effort: 2 days_

---

## LOW Priority — Nice to Have

- [ ] **15. MFA/2FA** — TOTP-based two-factor auth. _Effort: 2–3 days_
- [ ] **16. Charts/visualizations in analytics** — Admin and recruiter dashboards. _Effort: 2–3 days_
- [ ] **17. Cookie consent banner** — GDPR/DPDP consent UI. _Effort: 1 day_
- [ ] **18. Blog content** — Real posts or remove placeholder. _Effort: Ongoing_
- [ ] **19. ATS integrations** — Integrations with external ATS. _Effort: 1–2 weeks_
- [ ] **20. Job queue system** — Bull/BullMQ for async processing. _Effort: 3–4 days_

---

## Security Checklist (Pre-Launch)

- [ ] Add rate limiting to all expensive endpoints
- [ ] Review all admin client usage for security
- [ ] Enable production CSRF validation
- [ ] Audit Stripe webhook signature verification
- [ ] Verify CORS origins in production

---

## Testing Improvements

- [ ] Add React Testing Library + 20 critical component tests
- [ ] Add E2E tests: apply flow, job creation, fit score viewing
- [ ] Increase Vitest coverage thresholds to 60%
- [ ] Add integration tests for Stripe checkout flow
- [ ] Add tests for Resend, Apify, WhatsApp, ConsentService

---

## Observability Improvements

- [ ] Propagate correlation IDs to Stripe, Anthropic, Resend
- [ ] Add Sentry to all API routes
- [ ] Implement metrics export (Prometheus/Datadog)
- [ ] Set up PagerDuty/on-call integration
- [ ] Add log aggregation (optional)

---

## Performance Improvements

- [ ] Fix N+1 queries (shortlist route, candidate lookups)
- [ ] Add compression headers (gzip/brotli)
- [ ] Add cache headers for static assets
- [ ] Implement cache hit/miss metrics
- [ ] (Later) Job queue for async processing

---

## Pre-Launch Week-by-Week (Suggested)

### Week 1 (Feb 23 – Mar 1)

- [ ] Fix organization approval workflow
- [ ] Complete privacy policy & ToS content
- [ ] Add page-specific SEO metadata
- [ ] Add rate limiting to FitScore and file upload endpoints

### Week 2 (Mar 2 – Mar 8)

- [ ] Implement email notifications (application updates, interview reminders)
- [ ] Add E2E tests for apply flow, job creation, fit score viewing
- [ ] Set up Sentry for all API routes
- [ ] Add cache metrics

### Week 3 (Mar 9 – Mar 15)

- [ ] Build job search/browse page for candidates
- [ ] Add notification UI (bell, preferences)
- [ ] Calendar integration research & planning

### Week 4 (Mar 16 – Mar 22)

- [ ] Implement calendar integration (Google/Outlook)
- [ ] Add admin billing dashboard
- [ ] Add 20+ component tests
- [ ] Bulk operations for recruiters

### Week 5 (Mar 23 – Apr 1)

- [ ] Final security audit
- [ ] Run k6 load tests
- [ ] Documentation review
- [ ] Bug fixes from testing

---

_Last updated: Feb 23, 2026_
