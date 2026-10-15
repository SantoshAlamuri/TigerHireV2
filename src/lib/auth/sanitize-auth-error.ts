/**
 * Returns a user-facing error message. In production, technical messages
 * (URLs, env vars, internal config) are replaced with a generic message
 * so customers never see implementation details.
 */
const GENERIC_MESSAGE =
  "Something went wrong. Please try again or contact support if the problem continues.";

const TECHNICAL_PATTERNS = [
  /\.env\.local/i,
  /NEXT_PUBLIC_SUPABASE/i,
  /SUPABASE_SERVICE_ROLE/i,
  /supabase\.co\/auth/i,
  /grant_type|token\?/i,
  /Dashboard.*URL Configuration/i,
  /project is not paused/i,
  /Failed to fetch/i,
  /^Network error:/i,
  /required when using auth/i,
  /required for admin/i,
];

/** Map Supabase auth error messages (e.g. from 400 on token endpoint) to clear user-facing text. */
const AUTH_MESSAGE_MAP: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /invalid login credentials|invalid_grant|invalid_credentials/i,
    message: "Invalid email or password. Please check and try again.",
  },
  {
    pattern: /email not confirmed|email_not_confirmed|signup requires confirmation/i,
    message: "Please confirm your email using the link we sent you, then try again.",
  },
  {
    pattern: /user (is )?banned|user_banned/i,
    message: "This account has been disabled. Contact support.",
  },
  {
    pattern: /too many requests|rate limit/i,
    message: "Too many attempts. Please wait a minute and try again.",
  },
  {
    pattern: /password should contain|password.*strength|weak password/i,
    message:
      "Password must include lowercase letters, uppercase letters, and numbers (your project may require more — check the hint below the field).",
  },
  {
    pattern: /error sending confirmation email|could not send.*confirm|mailer.*error/i,
    message:
      'We could not send the verification email. Try again in a few minutes. If you run this project locally, open Supabase -> Authentication -> email: configure SMTP or turn off "Confirm email" for testing.',
  },
  // Fallback for 400 from auth/v1/token (wrong credentials, missing user, or generic bad request)
  {
    pattern: /bad request|invalid request|invalid_request|^400$|grant_type/i,
    message:
      "Invalid email or password. If you just signed up, check your email to confirm your account, or try resetting your password.",
  },
];

function looksTechnical(message: string): boolean {
  return TECHNICAL_PATTERNS.some((re) => re.test(message));
}

function mapAuthError(message: string): string | null {
  const lower = message.trim().toLowerCase();
  for (const { pattern, message: mapped } of AUTH_MESSAGE_MAP) {
    if (pattern.test(lower)) return mapped;
  }
  return null;
}

export function toUserFacingAuthError(message: string): string {
  if (typeof message !== "string" || !message.trim()) return GENERIC_MESSAGE;
  const mapped = mapAuthError(message);
  if (mapped) return mapped;
  if (process.env.NODE_ENV === "development") return message;
  if (looksTechnical(message)) return GENERIC_MESSAGE;
  return message;
}
