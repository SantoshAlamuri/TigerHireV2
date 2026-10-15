-- Fix: "Database error querying schema" / 500 on sign-in
-- Cause: auth.users has NULL in token columns; GoTrue expects empty strings.
-- Run this ONCE in Supabase Dashboard → SQL Editor (project must have permission to update auth schema).
-- See: https://supabase.com/docs/guides/troubleshooting/scan-error-on-column-confirmation_token-converting-null-to-string-is-unsupported-during-auth-login-a0c686
-- See: https://github.com/supabase/auth/issues/1940

UPDATE auth.users SET confirmation_token = '' WHERE confirmation_token IS NULL;
UPDATE auth.users SET email_change = '' WHERE email_change IS NULL;
UPDATE auth.users SET email_change_token_new = '' WHERE email_change_token_new IS NULL;
UPDATE auth.users SET recovery_token = '' WHERE recovery_token IS NULL;
