const INTEGRATION_PREFIX = "tigerhire_";

/** Support both standard SDK names and Vercel integration-managed fallbacks. */
export function getInngestCredentials(env: NodeJS.ProcessEnv = process.env) {
  return {
    eventKey: env.INNGEST_EVENT_KEY || env[`${INTEGRATION_PREFIX}INNGEST_EVENT_KEY`],
    signingKey: env.INNGEST_SIGNING_KEY || env[`${INTEGRATION_PREFIX}INNGEST_SIGNING_KEY`],
    signingKeyFallback:
      env.INNGEST_SIGNING_KEY_FALLBACK || env[`${INTEGRATION_PREFIX}INNGEST_SIGNING_KEY_FALLBACK`],
  };
}
