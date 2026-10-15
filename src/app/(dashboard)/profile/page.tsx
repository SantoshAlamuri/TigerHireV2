"use client";

import { useState } from "react";
import { Save, User, Building2, Mail, Loader2, Check, Bell, Link2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiMutation, useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import { ROLE_LABELS } from "@/types";
import type { EmailPreferences } from "@/types";
import type { OAuthSsoProvider } from "@/lib/auth/oauth-sso-providers";

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const {
    data: profileData,
    loading,
    error: profileError,
    refetch: refetchProfile,
    mergeData: mergeProfileData,
  } = useApiQuery<{
    profile: Record<string, unknown>;
    candidate: Record<string, unknown> | null;
  }>("/api/profiles");

  const {
    data: emailPrefsData,
    loading: emailPrefsLoading,
    error: emailPrefsError,
  } = useApiQuery<{
    preferences: EmailPreferences & Record<string, unknown>;
  }>("/api/email-preferences");

  const {
    data: linkData,
    loading: linkLoading,
    error: linkError,
  } = useApiQuery<{
    identities: Array<{
      provider: string;
      identity_id: string;
      created_at: string;
    }>;
  }>("/api/auth/link");

  const profile = profileData?.profile;
  const emailPrefs = emailPrefsData?.preferences;

  const {
    mutate: saveProfile,
    loading: saving,
    error: saveError,
  } = useOptimisticMutation<
    { profile: Record<string, unknown>; candidate: Record<string, unknown> | null },
    { name: string }
  >("/api/profiles", {
    method: "PATCH",
    onMutate: ({ name }) => {
      const previousName = displayName;
      setSaved(false);
      mergeProfileData((prev) => {
        if (!prev) return { profile: { full_name: name }, candidate: null };
        return {
          ...prev,
          profile: {
            ...prev.profile,
            full_name: name,
          },
        };
      });
      return () => {
        mergeProfileData((prev) => {
          if (!prev) return { profile: { full_name: previousName }, candidate: null };
          return {
            ...prev,
            profile: {
              ...prev.profile,
              full_name: previousName,
            },
          };
        });
      };
    },
    onSuccess: (result) => {
      setNameOverride(null);
      mergeProfileData((prev) => {
        if (!prev) {
          return {
            profile: result.profile,
            candidate: result.candidate,
          };
        }
        const prevProfile = prev.profile;
        return {
          ...prev,
          profile: {
            ...prevProfile,
            ...result.profile,
            organisations: prevProfile.organisations,
          },
          candidate: result.candidate ?? prev.candidate,
        };
      });
      setSaved(true);
      toast({
        title: "Profile saved",
        tone: "success",
      });
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err, _vars, rollback) => {
      rollback();
      toast({
        title: "Could not save profile",
        description: err.message,
        tone: "error",
      });
    },
  });

  const { mutate: linkProvider, loading: linkConnecting } = useApiMutation<
    { provider: OAuthSsoProvider },
    { url: string }
  >("/api/auth/link", "POST");

  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [prefsOverride, setPrefsOverride] = useState<EmailPreferences | null>(null);
  const [saved, setSaved] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<OAuthSsoProvider | null>(null);

  const displayName = nameOverride ?? (profile ? ((profile.full_name as string) ?? "") : "");
  const defaultPrefs: EmailPreferences = {
    marketing: false,
    job_alerts: false,
    application_updates: false,
    messages: false,
    interview_reminders: false,
    weekly_digest: false,
  };
  const displayPrefs: EmailPreferences = prefsOverride
    ? prefsOverride
    : emailPrefs
      ? {
          marketing: !!emailPrefs.marketing,
          job_alerts: !!emailPrefs.job_alerts,
          application_updates: !!emailPrefs.application_updates,
          messages: !!emailPrefs.messages,
          interview_reminders: !!emailPrefs.interview_reminders,
          weekly_digest: !!emailPrefs.weekly_digest,
        }
      : defaultPrefs;

  async function handleSave() {
    await saveProfile({ name: displayName });
  }

  const inputClass =
    "w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-body text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15";

  const roleLabel = user?.role ? ROLE_LABELS[user.role] : "User";
  const organisationName = (profile?.organisations as { name?: string })?.name;

  if (loading) {
    return (
      <>
        <PageHeader title="My Profile" subtitle="Loading..." />
        <div className="mx-auto max-w-2xl space-y-4 py-2">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      </>
    );
  }

  if (profileError || !profile) {
    return (
      <>
        <PageHeader title="My Profile" subtitle="Could not load profile" />
        <div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-6">
          <p className="text-sm text-rose-300">
            {profileError ?? "Profile not found. Try signing in again or contact support."}
          </p>
          <button
            type="button"
            onClick={() => void refetchProfile()}
            className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/[0.06]"
          >
            Retry
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="My Profile" subtitle="Manage your account details" />
      <div className="mx-auto max-w-2xl space-y-6">
        {emailPrefsError ? (
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            Email preferences could not be loaded: {emailPrefsError}
          </p>
        ) : null}
        {linkError ? (
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            Connected accounts could not be loaded: {linkError}
          </p>
        ) : null}
        {/* Profile Overview Card */}
        <section className="card-lifted border border-[var(--border)] p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-2xl font-bold text-[var(--text)]">
              {displayName
                ? displayName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : "U"}
            </div>
            <div className="flex-1">
              <h3 className="heading-section text-lg text-[var(--text)]">
                {displayName || "Your Profile"}
              </h3>
              <p className="text-body text-sm text-white/60">{roleLabel}</p>
              {organisationName && (
                <p className="mt-1 flex items-center gap-1.5 text-body text-xs text-white/60">
                  <Building2 size={12} />
                  {organisationName}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Basic Info Form */}
        <section className="card-lifted border border-[var(--border)] p-6">
          <h3 className="heading-section mb-4 text-base text-[var(--text)]">Basic Information</h3>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="prof-name"
                className="mb-1.5 flex items-center gap-1.5 text-body text-sm font-normal text-white/65"
              >
                <User size={14} />
                Full Name
              </label>
              <input
                id="prof-name"
                type="text"
                value={displayName}
                onChange={(e) => setNameOverride(e.target.value)}
                placeholder="Enter your full name"
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="prof-email"
                className="mb-1.5 flex items-center gap-1.5 text-body text-sm font-normal text-white/65"
              >
                <Mail size={14} />
                Email
              </label>
              <input
                id="prof-email"
                type="email"
                value={user?.email ?? ""}
                disabled
                className={`${inputClass} cursor-not-allowed opacity-60`}
              />
              <p className="mt-1 text-xs text-white/45">
                Email cannot be changed. Contact support if you need to update your email address.
              </p>
            </div>

            <div>
              <label
                htmlFor="prof-role"
                className="mb-1.5 block text-body text-sm font-normal text-white/65"
              >
                Role
              </label>
              <input
                id="prof-role"
                type="text"
                value={roleLabel}
                disabled
                className={`${inputClass} cursor-not-allowed opacity-60`}
              />
            </div>
          </div>
        </section>

        {/* Connected Accounts */}
        <section className="card-lifted border border-[var(--border)] p-6">
          <h3 className="heading-section mb-4 flex items-center gap-2 text-base text-[var(--text)]">
            <Link2 size={18} />
            Connected Accounts
          </h3>
          {linkLoading ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 size={16} className="animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="space-y-3">
              {[
                {
                  provider: "google" as const,
                  label: "Google",
                  icon: (
                    <svg className="h-8 w-8 shrink-0" viewBox="0 0 24 24" aria-hidden>
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                  ),
                },
                {
                  provider: "linkedin_oidc" as const,
                  label: "LinkedIn",
                  icon: (
                    <svg
                      className="h-8 w-8 shrink-0 text-[#0A66C2]"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  ),
                },
              ].map(({ provider, label, icon }) => {
                const connected = linkData?.identities?.some((i) => i.provider === provider);
                return (
                  <div key={provider} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {icon}
                      <span className="sr-only">{label}</span>
                    </div>
                    {connected ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                        <Check size={12} />
                        Connected
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={linkConnecting}
                        onClick={async () => {
                          setConnectingProvider(provider);
                          const data = await linkProvider({ provider });
                          setConnectingProvider(null);
                          if (data?.url) window.location.href = data.url;
                        }}
                        className="rounded-md border border-white/10 px-4 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {connectingProvider === provider ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          "Connect"
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Role-Specific Info */}
        {user?.role === "candidate_pro" || user?.role === "candidate_free" ? (
          <>
            <section className="card-lifted border border-[var(--border)] p-6">
              <h3 className="heading-section mb-4 text-base text-[var(--text)]">
                Candidate Profile
              </h3>
              <p className="text-body text-sm text-white/60">
                Manage your detailed candidate profile, including skills, experience, and resume.
              </p>
              <a
                href="/candidate/profile"
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)]"
              >
                Go to Candidate Profile
              </a>
            </section>
            <section className="card-lifted border border-[var(--border)] p-6">
              <h3 className="heading-section mb-4 text-base text-[var(--text)]">Job preferences</h3>
              <p className="text-body text-sm text-white/60">
                Set your preferred locations, work mode, seniority, and salary range for better job
                matches.
              </p>
              <a
                href="/candidate/preferences"
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-6 py-2.5 text-sm font-semibold text-white/90 transition hover:bg-white/[0.06]"
              >
                Edit preferences
              </a>
            </section>
          </>
        ) : null}

        {/* Email preferences */}
        <section className="card-lifted border border-[var(--border)] p-6">
          <h3 className="heading-section mb-4 flex items-center gap-2 text-base text-[var(--text)]">
            <Bell size={18} />
            Email preferences
          </h3>
          {emailPrefsLoading ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 size={16} className="animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="space-y-3">
              {[
                {
                  key: "marketing" as const,
                  label: "Marketing and product updates",
                },
                {
                  key: "job_alerts" as const,
                  label: "Job alerts for saved searches",
                },
                {
                  key: "application_updates" as const,
                  label: "Application status updates",
                },
                {
                  key: "messages" as const,
                  label: "New message notifications",
                },
                {
                  key: "interview_reminders" as const,
                  label: "Interview reminders",
                },
                { key: "weekly_digest" as const, label: "Weekly digest" },
              ].map(({ key, label }) => {
                const isChecked = displayPrefs[key];
                return (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-[var(--text)]">{label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isChecked ? "true" : "false"}
                      aria-label={`${label} ${displayPrefs[key] ? "on" : "off"}`}
                      onClick={() => {
                        const next = {
                          ...displayPrefs,
                          [key]: !displayPrefs[key],
                        };
                        setPrefsOverride(next);
                        setPrefsSaving(true);
                        setPrefsSaved(false);
                        fetch("/api/email-preferences", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(next),
                          credentials: "include",
                        })
                          .then(() => {
                            setPrefsSaved(true);
                            setTimeout(() => setPrefsSaved(false), 2000);
                          })
                          .finally(() => setPrefsSaving(false));
                      }}
                      disabled={prefsSaving}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${displayPrefs[key] ? "bg-[var(--accent)]" : "bg-[var(--border-interactive)]"}`}
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5 ${displayPrefs[key] ? "translate-x-[22px]" : "translate-x-[2px]"}`}
                      />
                    </button>
                  </div>
                );
              })}
              {prefsSaved && (
                <p className="flex items-center gap-1 text-sm text-emerald-300">
                  <Check size={14} />
                  Preferences saved
                </p>
              )}
            </div>
          )}
        </section>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-3 pb-4">
          {saveError && <p className="text-sm text-rose-300">{saveError}</p>}
          {saved && (
            <p className="flex items-center gap-1 text-sm text-emerald-300">
              <Check size={14} />
              Profile saved!
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>
    </>
  );
}
