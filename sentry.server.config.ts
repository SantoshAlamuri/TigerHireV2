import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
  });

  process.on("unhandledRejection", (reason) => {
    Sentry.captureException(reason);
  });
  process.on("uncaughtException", (error) => {
    Sentry.captureException(error);
  });
}
