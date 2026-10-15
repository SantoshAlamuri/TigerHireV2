import Link from "next/link";
import { ArrowRight, CalendarCheck, Inbox, MessageSquare, ListChecks } from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";
import { IconTile } from "@/components/ui/IconTile";
import { buttonClasses } from "@/components/ui/Button";
import styles from "@/app/(public)/v2/v2.module.css";

/**
 * Homepage automation/time-saved section. Replaces the inline demo widget
 * (now on /demo) — this is the "what the agent does for you" story: intake,
 * screening, scheduling, one pipeline.
 */
const AUTOMATIONS = [
  {
    icon: <MessageSquare size={18} />,
    title: "Apply on WhatsApp or a link",
    body: "Candidates drop a CV on chat or the apply link — parsed, queued, and scored without data entry for you.",
  },
  {
    icon: <ListChecks size={18} />,
    title: "Screening runs itself",
    body: "Your knockout questions go out over WhatsApp automatically; answers land on the candidate's card.",
  },
  {
    icon: <CalendarCheck size={18} />,
    title: "Interviews book themselves",
    body: "Candidates pick slots on chat. No phone tag, no back-and-forth email threads.",
  },
  {
    icon: <Inbox size={18} />,
    title: "Every channel, one scored queue",
    body: "Naukri, LinkedIn, email, referrals — everything lands in one pipeline, already read and ranked.",
  },
];

export default function AutomationSectionV2() {
  return (
    <section id="automation" className="border-t border-[var(--border)] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className={`${styles.mono} text-xs uppercase tracking-[0.14em] text-[var(--accent)]`}>
          Automation · your week back, every role
        </p>
        <h2 className="mt-3.5 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
          The agent does the busywork.
          <br />
          You make the call.
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-[var(--text-muted)]">
          A recruiter gets{" "}
          <strong className="font-semibold text-[var(--text)]">30–45 seconds per CV</strong> —
          enough to skim, never to read. The agent{" "}
          <strong className="font-semibold text-[var(--text)]">reads every one properly</strong>,
          then takes on the screening questions, the scheduling, and the follow-ups that eat the
          rest of the week.
        </p>
        <ScrollReveal className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUTOMATIONS.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6"
            >
              <IconTile size="md">{item.icon}</IconTile>
              <h3 className="mb-2 mt-3 text-[16.5px] font-bold">{item.title}</h3>
              <p className="text-sm text-[var(--text-muted)]">{item.body}</p>
            </div>
          ))}
        </ScrollReveal>
        <div className="mt-10 flex flex-wrap items-center gap-5 rounded-2xl border border-[var(--border-interactive)] bg-[var(--bg-elevated)] p-7">
          <div className="min-w-[260px] flex-1">
            <h3 className="text-lg font-bold">See it work before you believe it.</h3>
            <p className="mt-1 text-[15px] text-[var(--text-muted)]">
              Paste any JD and watch the agent build a rubric and score sample CVs — live, free,
              with evidence attached.
            </p>
          </div>
          <Link href="/demo" className={buttonClasses("primary", "md", "gap-2")}>
            Try the live demo <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}
