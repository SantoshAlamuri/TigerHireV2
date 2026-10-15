/**
 * Turning a company's approval policy into the steps one requisition must pass.
 *
 * The policy is authored per org (requisition_approval_chains); this decides
 * what it means for a specific requisition — which steps apply, which are
 * skipped, and who may not be the approver.
 *
 * Three rules earn their place here, all of them learned from how approval
 * gates fail in practice:
 *
 *  1. A skipped step is NOT an approval. It is recorded as skipped, with the
 *     reason, so "who signed off on this?" never has a silent answer.
 *  2. Nobody approves their own requisition. A chain of "recruiter → company
 *     admin" is only safe if the company admin who raised it cannot then be
 *     the company admin who approves it.
 *  3. If every step is skipped, that is auto-approval, and it is stated as
 *     such rather than quietly producing an empty chain that the runtime
 *     completes instantly. An empty plan and an intentional no-approval policy
 *     look identical from the outside and must not.
 */

export interface ChainStepDef {
  approverRole: string;
  /** Steps sharing an order approve in parallel. */
  stepOrder: number;
  slaHours: number;
  /** Roles whose own requisitions bypass this step. */
  skipWhenRaiserRole?: string[];
  /** Skip when the requisition's budget is under this, in hiring_requests units. */
  skipWhenBudgetBelow?: number | null;
}

export interface ChainDef {
  id: string;
  name: string;
  steps: ChainStepDef[];
}

export interface RequisitionFacts {
  /** Role of the person who raised it. */
  raiserRole: string | null;
  /** Profile id of the person who raised it — never the approver of their own. */
  raiserProfileId: string | null;
  /** hiring_requests.budget_ctc_max, or null when not captured. */
  budgetMax?: number | null;
}

export interface ResolvedStep {
  stageKey: string;
  stageOrder: number;
  approverRole: string;
  slaHours: number;
  /**
   * The approver must not be this person. Carried through to assignment rather
   * than resolved here, because who holds a role is a database question.
   */
  excludeProfileId: string | null;
}

export interface SkippedStep {
  approverRole: string;
  reason: string;
}

export interface ResolvedChain {
  steps: ResolvedStep[];
  skipped: SkippedStep[];
  /**
   * True ONLY when the org authored an intentionally-empty chain (an explicit
   * "no approval needed" policy). A chain whose steps all happened to be skipped
   * is NOT auto-approved — see blockedNoApprovers. (#351)
   */
  autoApprove: boolean;
  /** Why it auto-approves, for the audit trail. Empty unless autoApprove. */
  autoApproveReason: string | null;
  /**
   * True when the computed chain is empty because every authored step was
   * skipped, and there is no explicit no-approval policy. The requisition must
   * NOT auto-approve — the caller falls back to a default approval chain so a
   * human still signs off. (#351)
   */
  blockedNoApprovers: boolean;
  blockedReason: string | null;
}

function skipReason(step: ChainStepDef, facts: RequisitionFacts): string | null {
  const raiser = facts.raiserRole?.trim();
  if (raiser && (step.skipWhenRaiserRole ?? []).includes(raiser)) {
    return `raised by ${raiser}, whose own requisitions bypass this step`;
  }
  const floor = step.skipWhenBudgetBelow;
  // NULL means "always applies". Zero would mean "skip when budget is under
  // zero", which never fires — treating them the same would make a policy
  // silently do nothing.
  if (floor != null && facts.budgetMax != null && facts.budgetMax < floor) {
    return `budget ${facts.budgetMax} is under the ${floor} threshold for this step`;
  }
  return null;
}

/**
 * Applies the policy to one requisition.
 *
 * Orders are re-indexed after skips so a removed step never leaves a gap the
 * runtime waits on — but steps that were parallel STAY parallel, because
 * collapsing them into a sequence would change the policy rather than apply it.
 */
export function resolveChain(chain: ChainDef, facts: RequisitionFacts): ResolvedChain {
  const skipped: SkippedStep[] = [];
  const kept: ChainStepDef[] = [];

  for (const step of [...chain.steps].sort((a, b) => a.stepOrder - b.stepOrder)) {
    const reason = skipReason(step, facts);
    if (reason) {
      skipped.push({ approverRole: step.approverRole, reason });
      continue;
    }
    kept.push(step);
  }

  // Preserve parallelism: distinct original orders map to distinct new orders,
  // in the same sequence, with no gaps.
  const distinctOrders = [...new Set(kept.map((s) => s.stepOrder))].sort((a, b) => a - b);
  const reindex = new Map(distinctOrders.map((o, i) => [o, i + 1]));

  const seenKeys = new Map<string, number>();
  const steps: ResolvedStep[] = kept.map((s) => {
    // Two steps in one chain can share a role (a second sign-off at a later
    // stage); the key must still be unique or the runtime overwrites one.
    const base = s.approverRole;
    const n = (seenKeys.get(base) ?? 0) + 1;
    seenKeys.set(base, n);
    return {
      stageKey: n === 1 ? base : `${base}_${n}`,
      stageOrder: reindex.get(s.stepOrder) ?? 1,
      approverRole: s.approverRole,
      slaHours: s.slaHours,
      excludeProfileId: facts.raiserProfileId,
    };
  });

  if (steps.length === 0) {
    // Distinguish an INTENTIONAL no-approval policy (the org authored a chain
    // with zero steps) from an ACCIDENT (the chain has steps, but budget/raiser
    // rules skipped every one). Only the former auto-approves; the latter is
    // blocked so the caller falls back to a real approval chain. (#351)
    const explicitlyNoApproval = chain.steps.length === 0;
    if (explicitlyNoApproval) {
      return {
        steps,
        skipped,
        autoApprove: true,
        autoApproveReason: "org policy: this chain is authored with no approval steps",
        blockedNoApprovers: false,
        blockedReason: null,
      };
    }
    return {
      steps,
      skipped,
      autoApprove: false,
      autoApproveReason: null,
      blockedNoApprovers: true,
      blockedReason: `every authored step was skipped (${skipped
        .map((s) => s.reason)
        .join("; ")}) and no explicit no-approval policy is configured`,
    };
  }

  return {
    steps,
    skipped,
    autoApprove: false,
    autoApproveReason: null,
    blockedNoApprovers: false,
    blockedReason: null,
  };
}

/**
 * The policy in a sentence, for the person authoring it.
 *
 * A chain builder that shows only its own widgets makes you simulate the rule
 * in your head. "HM raises → Company Admin approves → Recruiter works it" is
 * the sentence someone can check against their actual company policy.
 */
export function describeChain(chain: ChainDef, roleLabels: Record<string, string>): string {
  const label = (role: string) => roleLabels[role] ?? role;
  const byOrder = new Map<number, string[]>();
  for (const s of [...chain.steps].sort((a, b) => a.stepOrder - b.stepOrder)) {
    const list = byOrder.get(s.stepOrder) ?? [];
    list.push(label(s.approverRole));
    byOrder.set(s.stepOrder, list);
  }
  if (byOrder.size === 0) return "Raised → approved immediately (no approval steps)";
  const parts = [...byOrder.entries()]
    .sort((a, b) => a[0] - b[0])
    // Parallel steps read as "and", because they happen together.
    .map(([, roles]) => roles.join(" and "));
  return `Raised → ${parts.join(" → ")} → recruiter works it`;
}

/**
 * Problems worth refusing to save, rather than discovering when a requisition
 * stalls on a step nobody can action.
 */
export function validateChain(
  chain: ChainDef,
  orgRolesPresent: string[],
): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const present = new Set(orgRolesPresent);

  if (chain.steps.length === 0) {
    // Allowed, but it must be a decision rather than an empty form.
    problems.push("This chain has no steps — every requisition would be approved automatically.");
  }

  for (const s of chain.steps) {
    if (!present.has(s.approverRole)) {
      problems.push(
        `No active ${s.approverRole} in this organisation — a requisition would wait on nobody.`,
      );
    }
    if (s.slaHours <= 0) {
      problems.push(`${s.approverRole} has an SLA of ${s.slaHours}h, which can never be met.`);
    }
    if (s.skipWhenBudgetBelow != null && s.skipWhenBudgetBelow <= 0) {
      problems.push(
        `${s.approverRole} skips below ${s.skipWhenBudgetBelow}, a threshold no budget can fall under.`,
      );
    }
  }

  // A step that every raiser skips is dead configuration pretending to be a control.
  for (const s of chain.steps) {
    const skips = s.skipWhenRaiserRole ?? [];
    if (
      skips.length > 0 &&
      skips.includes(s.approverRole) &&
      skips.length >= orgRolesPresent.length
    ) {
      problems.push(`${s.approverRole} is skipped for every role that could raise a requisition.`);
    }
  }

  return { ok: problems.length === 0, problems };
}
