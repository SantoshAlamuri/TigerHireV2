# Voice Screening — Cost Strategy & Build Plan

**Status:** Proposed · 2026-07-10
**Owner:** Santosh
**Related:** `docs/specs/screening-v1.md`, `src/lib/screening/voice/bolna.ts`, feature flag `voice_screening_bolna`

## 1. Decision

Run voice screening as a **two-track strategy**:

1. **Validate now on Bolna** (already integrated, flag OFF, zero calls made). Managed cost ≈ ₹7–9/min all-in. At pilot volume the markup is noise compared to the engineering cost of self-hosting.
2. **Build the self-hosted Pipecat stack behind the existing provider interface** and cut over when volume crosses the trigger (§6). Target unit cost ≈ **₹0.70–1.05/min**, with WhatsApp user-initiated calling as the structural cost moat.

The metric we optimize is **₹ per completed screen**, not ₹ per minute. Duration levers (gap-question prompting) apply to _both_ tracks and ship first.

## 2. Verified market pricing (July 2026)

| Option                              | All-in ₹/min                      | Notes                                                    |
| ----------------------------------- | --------------------------------- | -------------------------------------------------------- |
| Vapi / Retell (US managed)          | ₹9–26                             | $0.10–0.30 blended                                       |
| **Bolna (current integration)**     | **₹7–9 retail, ₹3–5.5 at volume** | $0.02/min platform fee + passthrough                     |
| Pipecat Cloud (Daily-hosted)        | hosting $0.01/min + components    | middle option; US PSTN $0.018/min, India needs own trunk |
| **Self-hosted Pipecat (this plan)** | **₹0.70–1.05**                    | see BOM §4                                               |

Component prices verified: Deepgram Nova-3 mono streaming $0.0048/min (₹0.41); Sarvam Saarika STT ₹30/hr (₹0.50/min, better Hinglish); Sarvam Bulbul TTS ₹15–30/10K chars; India SIP trunk domestic ₹0.30–0.50/min at enterprise rates; WhatsApp Calling API — **user-initiated calls free**, business-initiated billed per-minute in 6-sec increments, answered-only (exact India rate: pull from Meta rate card, gated behind login).

## 3. Cost levers (apply in this order)

1. **Gap-question prompting** (provider-agnostic, ship first). We hold the CV, FitScore, and amber flags before dialing. Prompt the agent with only the 3–4 unresolved concerns for _this_ candidate (service-industry background, gaps, notice period — the Masai/Ishita flag list) instead of a generic 8-question script. Cuts call from ~7 min to ~3–4 min → halves every line item on any provider.
2. **WhatsApp user-initiated call leg** (free telephony). After the existing WhatsApp screening intro, send a call-permission/CTA message; candidate taps to call → ₹0 voice leg, branded caller identity, consent trail built in. PSTN via SIP trunk (₹0.30–0.45) is the fallback for candidates who don't tap.
3. **Pre-synthesized TTS.** Screening questions are stable per job (`job_screening_questions`). Synthesize once per job + cache canned acknowledgments; live TTS only for dynamic follow-ups (~20–25% of agent speech). TTS drops ₹0.55 → ₹0.10–0.15/call-min. Also removes TTS latency on scripted turns.
4. **VAD-gated STT.** Pipecat already runs Silero VAD; only stream speech segments (+padding buffer) to Deepgram. ₹0.41 → ~₹0.25/call-min. Test for first-syllable clipping before enabling.
5. **LLM prompt caching.** System prompt + JD + script identical across turns/candidates per job. gpt-4o-mini or Gemini Flash-Lite with caching → ₹0.05–0.10/min. Already cheap; don't over-invest.
6. **Per-second pulse billing** on whatever trunk we sign — 60-sec pulses are a hidden ~15% tax.

## 4. Target bill of materials (self-hosted)

| Component | Choice                                                                        | ₹/call-min     |
| --------- | ----------------------------------------------------------------------------- | -------------- |
| Telephony | WhatsApp user-initiated (₹~0) / SIP fallback                                  | 0.00–0.45      |
| STT       | Deepgram Nova-3 VAD-gated (Sarvam Saarika if Hinglish accuracy wins bake-off) | 0.20–0.30      |
| LLM       | gpt-4o-mini / Flash-Lite, cached                                              | 0.05–0.10      |
| TTS       | Sarvam Bulbul, live for dynamic speech only                                   | 0.10–0.20      |
| Server    | 4-vCPU box, 50+ concurrent calls                                              | ~0.02          |
| **Total** |                                                                               | **₹0.40–1.05** |

## 5. Architecture: provider abstraction

`bolna.ts` already defines the right seam: initiate(params with script/system_prompt) → webhook returns `{transcript, audio_url, duration_seconds, status}`. Formalize this as a `VoiceScreeningProvider` interface with two implementations:

- `BolnaProvider` — current code, unchanged behavior.
- `PipecatProvider` — points at our Python Pipecat service; same webhook artifact contract back into the existing scoring path.

Provider selected per-org (or globally) via config; cutover is a flag flip, rollback likewise. Add a `voice_call_costs` breakdown (telephony/stt/llm/tts, provider, duration) logged per call from day one so the cutover decision is data, not vibes.

## 6. Phases & triggers

**Phase 0 — Validate (now, ~0 eng-weeks).** Flip `voice_screening_bolna` for one pilot org/job (Masai). Measure: answer rate, completion rate, transcript quality (Ishita review), cost/screen. Kill criteria: answer rate <30% or completion <50% → voice channel itself isn't viable; stop before any build.

**Phase 1 — Optimize on managed (~1 eng-week).** Gap-question prompt builder from FitScore flags; cost telemetry; duration cap (6 min hard, 4 min target). Expected: ₹40/screen → ~₹25/screen on Bolna without touching infra.

**Phase 2 — Build Pipecat stack (trigger-gated, ~2–3 eng-weeks).**
Trigger: monthly managed voice spend > **₹50k** (~6,000 min ≈ 1,200–1,500 screens/mo) sustained for a month, OR a strategic need Bolna can't serve (WhatsApp calling, custom barge-in, data residency). At that spend, the ₹6–8/min delta pays back the build inside a quarter.
Scope: Python Pipecat service (Silero VAD, Deepgram/Sarvam STT bake-off, cached-audio playout, Sarvam TTS), Exotel AgentStream or direct-SIP WebSocket leg, WhatsApp Calling API leg, `PipecatProvider` webhook adapter, load test at 25 concurrent.

**Phase 3 — Cut over.** 10% traffic split Pipecat vs Bolna, compare completion/quality/cost per screen for 2 weeks, then shift default. Keep Bolna as break-glass fallback provider.

## 7. Compliance & ops notes

- **TRAI/TCCCPR:** screening calls to applicants are service/transactional; get the trunk provider's written classification. WhatsApp consent trail (already collected) is the clean audit answer. WhatsApp Calling additionally requires an accepted call-permission request — consent by construction.
- **Recording:** disclose recording at call start; store audio in Supabase storage with same RLS posture as CV files.
- **WABA:** calling must be enabled on our WhatsApp Business phone number (Meta setting / BSP support ticket); verify our number qualifies before Phase 2 commits to that leg.
- **Latency budget:** <800ms turn-taking; pre-synth playout (lever 3) is also the main latency win.

## 8. Open questions

- Exact Meta India rate for business-initiated WhatsApp calls (rate card behind developer login).
- Sarvam vs Deepgram STT accuracy on Hinglish screening audio — needs a bake-off on real pilot transcripts (Phase 0 gives us the corpus).
- Whether Bolna supports injected pre-recorded audio (would let lever 3 ship in Phase 1 without waiting for Phase 2).
