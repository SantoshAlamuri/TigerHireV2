import { randomBytes } from "crypto";

export type AgentName =
  | "talent_scout"
  | "hiring_signal"
  | "fitscore"
  | "scout"
  | "verify"
  | "vouch"
  | "public_apply"
  | "scheduler"
  | "consent"
  | "ghostbuster"
  | "trust_score"
  | "orchestrator"
  | "normalizer"
  | "validator"
  | "auto_reply"
  | "info_request";

export interface AgentRunContext {
  agentName: AgentName;
  runId: string;
  startedAt: Date;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  errors: string[];
  meta?: Record<string, unknown>;
}

export function createRunContext(agentName: AgentName): AgentRunContext {
  return {
    agentName,
    runId: `${agentName}_${Date.now()}_${randomBytes(4).toString("hex")}`,
    startedAt: new Date(),
    recordsProcessed: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    errors: [],
  };
}

export interface SignalRecord {
  source: string;
  external_id: string;
  raw_data: Record<string, unknown>;
  candidate_id?: string;
}
