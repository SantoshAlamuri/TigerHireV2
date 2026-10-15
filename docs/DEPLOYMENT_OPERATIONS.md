# Deployment & Operations

## Rollback

- **Vercel**: Use the Vercel dashboard Deployments tab to promote a previous deployment (instant rollback). Alternatively, revert the Git commit and push to trigger a new deployment.
- **Git-based**: `git revert <commit> && git push` then wait for CI and Vercel to deploy.

## Canary / Blue-Green

- **Vercel**: Use **Preview deployments** per branch/PR as canary. Deploy to production (main) after validation.
- **Programmatic**: `vercel deploy --prod` from CLI with a specific commit for controlled rollouts. Consider Vercel's **Deployment Protection** or **Password protection** for preview URLs.

## Artifact Signing (Sigstore/Cosign)

To sign the build artifact in CI:

1. Install Cosign: `go install github.com/sigstore/cosign/v2/cmd/cosign@latest` or use the official GitHub Action.
2. Generate a key pair (or use keyless with OIDC): `cosign generate-key-pair`.
3. In CI, after build: sign the deployment artifact (e.g. `.next` tarball or image if using Docker) with `cosign sign-blob`.
4. Store the signature and document verification: `cosign verify-blob --signature ... --certificate ...`.

See [Sigstore Cosign](https://docs.sigstore.dev/cosign/overview/) for keyless and certificate flow.

## Continuous Profiling

- **Sentry**: Enable profiling in Sentry project settings; the Next.js SDK can send profiles with the same DSN. Set `profilesSampleRate` in `sentry.server.config.ts` if needed.
- **Pyroscope/Parca**: Run the agent in the same environment as the app and point it at the Node process; expose profiles via the agent’s UI or Grafana.

## Chaos / Resilience

- **Datastore unavailability**: See `tests/unit/health-route.test.ts` and chaos-style tests that assert the app returns 503 or degrades when Supabase is unreachable.
- For full chaos (e.g. killing DB in the middle of a request), use a dedicated chaos tool (e.g. Chaos Mesh, Gremlin) in a staging environment.
