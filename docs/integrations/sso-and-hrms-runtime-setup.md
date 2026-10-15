# SSO and HRMS Runtime Setup

## Supported Runtime Providers

### SSO

- Google SSO (`google_sso`)
- Microsoft Entra SSO (`microsoft_sso`)
- Okta SSO (`okta_sso`)

### HRMS (India-first scope)

- Darwinbox (`darwinbox`)
- Keka (`keka`)
- HiBob (`hibob`)

ATS providers are intentionally hidden from UI until runtime validation handlers are implemented.

## Configure in UI

Open `Company Settings -> Integrations` and configure cards under:

- `Identity & SSO`
- `HRMS`

After saving credentials, click `Validate` on each provider card.

## Required Fields by Provider

### Google SSO

- `clientId`
- `clientSecret`
- optional: `hostedDomain`

Validation checks:

- Google client id format (`.apps.googleusercontent.com`)
- OIDC discovery endpoint: `https://accounts.google.com/.well-known/openid-configuration`

### Microsoft Entra SSO

- `tenantId`
- `clientId`
- `clientSecret`

Validation checks:

- OIDC discovery endpoint:
  - `https://login.microsoftonline.com/{tenantId}/v2.0/.well-known/openid-configuration`

### Okta SSO

- `issuer`
- `clientId`
- `clientSecret`

Validation checks:

- OIDC discovery endpoint:
  - `{issuer}/.well-known/openid-configuration`

Auth runtime note:

- Login route supports Okta via Supabase provider path in `/api/auth/sso`.

### Keka

- `clientId`
- `clientSecret`
- secret `apiKey`
- optional override: `identityUrl` (default `https://login.keka.com/connect/token`)

Validation checks:

- Token exchange using:
  - `grant_type=kekaapi`
  - `scope=kekaapi`
  - `client_id`, `client_secret`, `api_key`

### HiBob

- `serviceUserId`
- secret `apiKey` (service user token)
- optional: `baseUrl` (default `https://api.hibob.com`)

Validation checks:

- Basic auth call to:
  - `{baseUrl}/v1/metadata/fields`

### Darwinbox

- `baseUrl`
- `clientId`
- `clientSecret`
- secret `apiKey`
- optional: `authPath` (default `/oauth/token`)

Validation checks:

- Token endpoint call:
  - `POST {baseUrl}{authPath}`
  - `grant_type=client_credentials`
  - `client_id`, `client_secret`, `api_key`

## Validation API

Route:

- `POST /api/settings/org/integrations/validate`

Payload:

- `{ "provider": "<provider_id>" }`

Behavior:

- Loads stored secret + config from `integration_connections`
- Runs provider-specific validation
- Persists:
  - `status` (`connected`/`error`)
  - `status_message`
  - `config.lastValidatedAt`
  - `config.lastValidation`
- Writes audit log event `integration.validated`

## Keep/Hide Rule

A provider should stay visible in company integrations UI only when:

1. Required credential schema is documented.
2. Validation handler exists in runtime.
3. Validation status persists to `integration_connections`.
