-- Audit #352 — per-offer OTP brute-force lockout.
--
-- APPLIED via MCP to BOTH DBs on 2026-08-20 (prod Mumbai + preview Sydney).
--
-- The public offer OTP is 6 digits with a 15-min TTL and only an IP rate limit
-- (whose key is client-controllable), so it was brute-forceable. This column
-- backs a per-offer failed-attempt counter; the verify route invalidates the OTP
-- after 5 misses, and the send route resets it to 0 when a fresh code is issued.
alter table public.offers
  add column if not exists public_token_otp_attempts integer not null default 0;
