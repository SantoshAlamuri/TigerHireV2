"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  CandidatesTabSection,
  LeaderboardTabSection,
  LinksTabSection,
} from "./components/ReferrerTabs";
import { NetworkTabSection } from "./_components/NetworkTabSection";
import { OverviewTabSection } from "./_components/OverviewTabSection";
import { ReferrerSetupSection } from "./_components/ReferrerSetupSection";
import { useReferrerDashboard } from "./_hooks/useReferrerDashboard";
import {
  EMPLOYEE_REFERRAL_STATUS_STYLES,
  daysSinceApplied,
  formatInr,
  payoutSplitLabel,
  payoutStatusPillClasses,
  pipelineStageLabel,
  pipelineStagePillClasses,
  whatsAppReferralLinkShareUrl,
} from "./_lib/helpers";

export default function ReferrerDashboardPage() {
  const {
    activeTab,
    setActiveTab,
    loading,
    data,
    copied,
    setupMode,
    setupCountryCode,
    setSetupCountryCode,
    setupLocalWhatsapp,
    setSetupLocalWhatsapp,
    setupOtp,
    setSetupOtp,
    otpRequested,
    setOtpRequested,
    setupSubmitting,
    setupError,
    setSetupError,
    debugOtpCode,
    debugOtpMessage,
    inviteCopied,
    jobsLoading,
    openJobs,
    showJobPicker,
    linkBusyJobId,
    renewBusyLinkId,
    linkActionMessage,
    linkedJobIdSet,
    totalCandidatesReferred,
    myRank,
    payoutRealization,
    linkActivationRate,
    tabs,
    title,
    subtitle,
    copyUrl,
    copyInviteLink,
    loadOpenJobs,
    renewReferralLink,
    generateSingleJobLink,
    startSetupOtp,
    verifySetupOtp,
  } = useReferrerDashboard();

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      {loading ? (
        <div className="space-y-4 py-2">
          <Skeleton className="h-12 w-80 rounded-full" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : setupMode ? (
        <ReferrerSetupSection
          setupCountryCode={setupCountryCode}
          setSetupCountryCode={setSetupCountryCode}
          setupLocalWhatsapp={setupLocalWhatsapp}
          setSetupLocalWhatsapp={setSetupLocalWhatsapp}
          setupOtp={setupOtp}
          setSetupOtp={setSetupOtp}
          otpRequested={otpRequested}
          setOtpRequested={setOtpRequested}
          setupSubmitting={setupSubmitting}
          setupError={setupError}
          setSetupError={setSetupError}
          debugOtpCode={debugOtpCode}
          debugOtpMessage={debugOtpMessage}
          startSetupOtp={startSetupOtp}
          verifySetupOtp={verifySetupOtp}
        />
      ) : data ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`rounded-md px-4 py-2 text-sm transition ${
                  activeTab === t.id
                    ? "bg-white/[0.05] text-white font-semibold border border-white/10"
                    : "border border-white/10 bg-white/[0.02] text-white/55 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === "overview" ? (
            <OverviewTabSection
              data={data}
              setActiveTab={setActiveTab}
              totalCandidatesReferred={totalCandidatesReferred}
              myRank={myRank}
              payoutRealization={payoutRealization}
              linkActivationRate={linkActivationRate}
              loadOpenJobs={loadOpenJobs}
              jobsLoading={jobsLoading}
            />
          ) : null}

          {activeTab === "links" ? (
            <LinksTabSection
              links={data.links}
              jobsLoading={jobsLoading}
              loadOpenJobs={loadOpenJobs}
              showJobPicker={showJobPicker}
              linkActionMessage={linkActionMessage}
              openJobs={openJobs}
              linkedJobIdSet={linkedJobIdSet}
              generateSingleJobLink={generateSingleJobLink}
              linkBusyJobId={linkBusyJobId}
              copied={copied}
              formatInr={formatInr}
              payoutSplitLabel={payoutSplitLabel}
              whatsAppReferralLinkShareUrl={whatsAppReferralLinkShareUrl}
              renewReferralLink={renewReferralLink}
              renewBusyLinkId={renewBusyLinkId}
              copyUrl={copyUrl}
            />
          ) : null}

          {activeTab === "network" ? (
            <NetworkTabSection
              referrerId={data.referrer.id}
              inviteCopied={inviteCopied}
              copyInviteLink={copyInviteLink}
            />
          ) : null}

          {activeTab === "candidates" ? (
            <CandidatesTabSection
              payouts={data.payouts}
              employeeWhatsappReferrals={data.employee_whatsapp_referrals ?? []}
              daysSinceApplied={daysSinceApplied}
              pipelineStagePillClasses={pipelineStagePillClasses}
              pipelineStageLabel={pipelineStageLabel}
              payoutStatusPillClasses={payoutStatusPillClasses}
              employeeReferralStatusStyles={EMPLOYEE_REFERRAL_STATUS_STYLES}
              formatInr={formatInr}
            />
          ) : null}

          {activeTab === "leaderboard" ? (
            <LeaderboardTabSection
              leaderboard={data.leaderboard}
              totalPaidInr={data.pool.total_paid_inr}
              formatInr={formatInr}
            />
          ) : null}
        </div>
      ) : (
        <div className="card-lifted border border-[var(--border)] p-8 text-center">
          <p className="text-sm text-white/60">Could not load referrer dashboard.</p>
        </div>
      )}
    </>
  );
}
