# Candidate Acknowledgement Copy & Policy Pack

## Operational Gate

- Do not flip any acknowledgement rollout flag to `true` unless all variants below have legal + product sign-off recorded.
- Current gate status: `blocked_pending_signoff`
- Sign-off owner: Legal (`legal@tigerhire.io`) + Product (hiring product owner; named approver still pending assignment)
- Status checkpoint (2026-05-03): all listed variants remain `pending_signoff`; no acknowledgement rollout flags should be enabled.

## direct_apply_received

- Status: `pending_signoff`
- Variant key: `direct_apply_received`
- Channels: `email`, `whatsapp`
- Approved by: _TBD_
- Approved at: _TBD_

## agency_shared_profile (PR-3)

- Status: `pending_signoff`
- Variant key: `agency_shared_profile`
- Channel: `whatsapp`
- Approved by: _TBD_
- Approved at: _TBD_
- Policy note: Keep `ack_agency_single_enabled=false` until legal/product sign-off is recorded here.

### Draft copy (internal only)

`Hi {first_name}, {agency_name} has shared your profile with {company_name}{optional_role_clause}. TigerHire will share updates if there is a fit. Reply STOP anytime to opt out of WhatsApp updates.`

### Source attribution guardrail

- If `agency_name` is missing/malformed, suppress the acknowledgement with `reason_code=invalid_source_attribution`.
- Do **not** fall back to generic attribution text (for example, "an agency") on this path.

## agency_bulk_shared_profile (PR-4)

- Status: `pending_signoff`
- Variant key: `agency_bulk_shared_profile`
- Channel: `whatsapp`
- Approved by: _TBD_
- Approved at: _TBD_
- Policy note: Keep `ack_agency_bulk_enabled=false` until legal/product sign-off is recorded here.

### Draft copy (internal only)

`Hi {first_name}, {agency_name} has shared your profile with {company_name}{optional_role_clause}. TigerHire will share updates if there is a fit. Reply STOP anytime to opt out of WhatsApp updates.`

## email_intake_received (PR-4)

- Status: `pending_signoff`
- Variant key: `email_intake_received`
- Channels: `email`, `whatsapp`
- Approved by: _TBD_
- Approved at: _TBD_
- Policy note: Keep `ack_email_intake_enabled=false` until legal/product sign-off is recorded here.

### Draft copy (internal only)

`Hi {first_name}, we received your profile by email for {job_title} at {company_name}. We will share updates if there is a fit. Reply STOP anytime to opt out of WhatsApp updates.`
