# HRIS vendor research and TigerHire readiness

Last updated: 2026-04-26

## Scope

Requested vendors:

1. Keka
2. Darwinbox
3. BambooHR (additional leading HRIS)
4. Workday (additional leading enterprise HCM)

## Official documentation links

### Keka

- Authentication overview: <https://developers.keka.com/reference/authentication>
- Token endpoint reference: <https://developers.keka.com/reference/token-1>

### Darwinbox

- API docs landing: <https://api-docs.darwinbox.com/>
- Note: detailed endpoint docs are often tenant/partner-access controlled. Confirm exact auth path and scopes with Darwinbox partner support for each customer tenant.

### BambooHR

- Getting started: <https://documentation.bamboohr.com/docs/getting-started>
- Technical API details: <https://documentation.bamboohr.com/docs/api-details>
- Webhooks: <https://documentation.bamboohr.com/docs/webhooks>

### Workday

- Developer portal: <https://developer.workday.com/en-us/docs/rest-api>
- Note: API console and some endpoint catalogs require Workday developer login + tenant-specific security setup.

## Authentication and validation model (what TigerHire now supports)

| Vendor    | TigerHire auth approach                  | Validation strategy in TigerHire                         |
| --------- | ---------------------------------------- | -------------------------------------------------------- |
| Keka      | API key + client credentials             | Token exchange at identity URL (`/connect/token`)        |
| Darwinbox | API key + client credentials + auth path | OAuth-style token request at configured auth endpoint    |
| BambooHR  | API key + company domain (Basic auth)    | `GET /api/v1/meta/fields` against tenant domain          |
| Workday   | OAuth client credentials                 | Token request against configured Workday OAuth token URL |

## "Ready from our end" status

### Product/config readiness

- HRIS providers available in org integrations UI:
  - `keka`
  - `darwinbox`
  - `hibob`
  - `bamboohr`
  - `workday`
- Each provider is mapped to HRIS lifecycle buckets/category for compliance/readiness scorecards.
- Validate action is enabled for all five HRIS providers.

### Backend readiness

- Provider validation handlers exist for:
  - Keka
  - Darwinbox
  - HiBob
  - BambooHR
  - Workday
- Validation route persists validation timestamp + message into integration config/status.
- Audit log entry is written for each validation attempt.
- HRIS sync run scaffold (phase 1) is available via:
  - `POST /api/settings/org/integrations/hris/sync`
  - `GET /api/settings/org/integrations/hris/sync`
  - Persisted run history in `hris_sync_runs`.

## Customer-facing credential checklist

### Keka

- `clientId`
- `clientSecret`
- `apiKey`
- Optional `identityUrl` override (defaults to production Keka login token URL)

### Darwinbox

- `baseUrl`
- `clientId`
- `clientSecret`
- `apiKey`
- Optional `authPath` (default `/oauth/token`; must be confirmed per tenant)

### BambooHR

- `companyDomain` (subdomain part of `https://{companyDomain}.bamboohr.com`)
- `apiKey` (or migration to OAuth flow in a later phase if required by customer security)

### Workday

- `tokenUrl` (tenant-specific OAuth token endpoint)
- `clientId`
- `clientSecret`
- Optional `scope`
- Workday integration-system-user and domain security policies configured by customer Workday admin

## Remaining partner dependencies (outside TigerHire code)

- Final vendor app approvals in customer tenants.
- Least-privilege scopes/permission groups for each service account.
- Production webhook registration per customer tenant (if bi-directional sync is required).
- Sandbox credentials for each customer before production cutover.

## Suggested rollout sequence

1. Complete one pilot tenant for each vendor in sandbox.
2. Run connection validation + one read API smoke test + one write/sync dry run.
3. Lock integration field mappings and retry/backoff policy per vendor.
4. Enable production tenant behind feature flag.
5. Monitor integration audit logs + provider error rate for first two weeks.
