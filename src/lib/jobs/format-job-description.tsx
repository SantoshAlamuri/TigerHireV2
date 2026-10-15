import type { ReactNode } from "react";
import type { JdSectionsView } from "@/types";

const REQUIRED_SKILL_SECTIONS = new Set<keyof JdSectionsView>([
  "technicalSkills",
  "leadershipSkills",
  "softSkills",
]);

const PREFERRED_SKILL_SECTIONS = new Set<keyof JdSectionsView>(["preferredSkills", "niceToHave"]);

function isSkillTagSection(sectionKey: keyof JdSectionsView): boolean {
  return REQUIRED_SKILL_SECTIONS.has(sectionKey);
}

function renderSkillTagPills(items: string[], sectionKey: keyof JdSectionsView): ReactNode {
  const isPreferred = PREFERRED_SKILL_SECTIONS.has(sectionKey);
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className={
            isPreferred
              ? "rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]"
              : "rounded-full bg-[var(--accent-muted)] px-3 py-1 text-xs font-medium text-[var(--accent)]"
          }
        >
          {item}
        </span>
      ))}
    </div>
  );
}

const LIST_SECTION_PATTERN =
  /responsibilit|qualification|requirement|looking for|success in this role|skills|must.?have|nice.to.have|what we are looking for/i;

/** Renders `**bold**` segments as <strong>. */
export function parseInlineBold(text: string, keyPrefix = ""): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter((part) => part.length > 0)
    .map((part, i) => {
      const match = part.match(/^\*\*(.+)\*\*$/);
      if (match) {
        return (
          <strong key={`${keyPrefix}b${i}`} className="font-semibold text-white">
            {match[1]}
          </strong>
        );
      }
      return <span key={`${keyPrefix}t${i}`}>{part}</span>;
    });
}

function headingFromBlock(block: string): string | null {
  const trimmed = block.trim();
  const singleLine = trimmed.match(/^\*\*(.+)\*\*$/);
  if (singleLine) return singleLine[1].trim();
  const lines = trimmed.split("\n").map((l) => l.trim());
  if (lines.length === 1 && lines[0]?.match(/^\*\*(.+)\*\*$/)) {
    return lines[0].replace(/^\*\*|\*\*$/g, "").trim();
  }
  return null;
}

function isBulletLine(line: string): boolean {
  return /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
}

function stripBulletPrefix(line: string): string {
  return line
    .replace(/^[-*•]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function isListSectionHeading(heading: string): boolean {
  return LIST_SECTION_PATTERN.test(heading);
}

export type DescriptionBlock =
  | { type: "heading"; text: string; listSection: boolean }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; items: string[] };

function parseSingleNewlineList(text: string): DescriptionBlock[] | null {
  if (text.includes("\n\n")) return null;

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const allBullets = lines.every(isBulletLine);
  const looksLikeList =
    allBullets || (lines.length >= 3 && lines.every((line) => line.length < 240));
  if (!looksLikeList) return null;

  return [{ type: "list", items: allBullets ? lines.map(stripBulletPrefix) : lines }];
}

/** Pure parser for job description text (markdown-lite). Exported for tests. */
export function parseJobDescriptionBlocks(text: string): DescriptionBlock[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const singleNewlineList = parseSingleNewlineList(normalized);
  if (singleNewlineList) return singleNewlineList;

  const blocks = normalized.split(/\n\n+/);
  const result: DescriptionBlock[] = [];
  let listMode = false;
  let pendingList: string[] = [];

  const flushPendingList = () => {
    if (pendingList.length === 0) return;
    result.push({ type: "list", items: [...pendingList] });
    pendingList = [];
  };

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const heading = headingFromBlock(trimmed);
    if (heading) {
      flushPendingList();
      listMode = isListSectionHeading(heading);
      result.push({ type: "heading", text: heading, listSection: listMode });
      continue;
    }

    const lines = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length > 0 && lines.every(isBulletLine)) {
      flushPendingList();
      listMode = false;
      result.push({ type: "list", items: lines.map(stripBulletPrefix) });
      continue;
    }

    if (listMode && lines.length === 1) {
      pendingList.push(lines[0]!);
      continue;
    }

    flushPendingList();
    listMode = false;
    result.push({ type: "paragraph", lines });
  }

  flushPendingList();
  return result;
}

const LIST_CLASS =
  "mt-3 list-disc space-y-2.5 pl-5 text-[15px] leading-relaxed text-white/90 marker:text-[var(--accent)]";
export const JD_SECTION_LIST_CLASS =
  "mt-2 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-white/90 marker:text-[var(--accent)]";
const PARAGRAPH_CLASS = "mt-4 text-[15px] leading-relaxed text-white/90";
const HEADING_CLASS =
  "mt-8 border-b border-white/10 pb-2 text-lg font-semibold tracking-tight text-white first:mt-0";

function resolveHiringRequestFields(jobRaw: Record<string, unknown>): {
  mustHaves: string | null;
  niceToHaves: string | null;
} {
  const hr = Array.isArray(jobRaw.hiring_requests)
    ? (jobRaw.hiring_requests[0] as Record<string, unknown> | undefined)
    : ((jobRaw.hiring_requests as Record<string, unknown> | null | undefined) ?? undefined);

  if (!hr) return { mustHaves: null, niceToHaves: null };

  return {
    mustHaves:
      typeof hr.must_haves === "string" && hr.must_haves.trim() ? hr.must_haves.trim() : null,
    niceToHaves:
      typeof hr.nice_to_haves === "string" && hr.nice_to_haves.trim()
        ? hr.nice_to_haves.trim()
        : null,
  };
}

const PUBLIC_SECTION_HEADING = "text-base font-semibold text-white";

export function PublicJobHiringRequestSections({ jobRaw }: { jobRaw: Record<string, unknown> }) {
  const { mustHaves, niceToHaves } = resolveHiringRequestFields(jobRaw);
  if (!mustHaves && !niceToHaves) return null;

  return (
    <>
      {mustHaves ? (
        <section className="mb-8 border-t border-[var(--border)] pt-6">
          <h2 className={PUBLIC_SECTION_HEADING}>Requirements</h2>
          <div className="mt-4">
            <PublicJobDescription text={mustHaves} />
          </div>
        </section>
      ) : null}
      {niceToHaves ? (
        <section className="mb-8 border-t border-[var(--border)] pt-6">
          <h2 className={PUBLIC_SECTION_HEADING}>Nice to have</h2>
          <div className="mt-4">
            <PublicJobDescription text={niceToHaves} />
          </div>
        </section>
      ) : null}
    </>
  );
}

export function renderPublicJdSectionValue(
  value: unknown,
  sectionKey?: keyof JdSectionsView,
): ReactNode {
  if (sectionKey && isSkillTagSection(sectionKey) && Array.isArray(value) && value.length > 0) {
    return renderSkillTagPills(value.map(String), sectionKey);
  }
  if (Array.isArray(value)) {
    return (
      <ul className={JD_SECTION_LIST_CLASS}>
        {value.map((item, i) => (
          <li key={i} className="pl-0.5">
            {parseInlineBold(String(item), `jd-${i}-`)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "string" && value.trim()) {
    return <PublicJobDescription text={value} />;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v != null);
    if (entries.length === 0) return null;
    return (
      <ul className={JD_SECTION_LIST_CLASS}>
        {entries.map(([key, entryValue]) => (
          <li key={key} className="pl-0.5">
            <span className="font-semibold text-white">{key}:</span>{" "}
            <span className="break-words">{parseInlineBold(String(entryValue))}</span>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

export function PublicJobDescription({ text }: { text: string }) {
  if (!text.trim()) return null;

  const blocks = parseJobDescriptionBlocks(text);

  return (
    <div className="public-job-description overflow-visible">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h3 key={`h-${index}`} className={HEADING_CLASS}>
              {block.text}
            </h3>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={`ul-${index}`} className={LIST_CLASS}>
              {block.items.map((item, i) => (
                <li key={i} className="pl-1">
                  {parseInlineBold(item, `li-${index}-${i}-`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`p-${index}`} className={PARAGRAPH_CLASS}>
            {block.lines.map((line, i) => (
              <span key={i}>
                {i > 0 ? <br /> : null}
                {parseInlineBold(line, `p-${index}-${i}-`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
