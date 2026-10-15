import { z } from "zod";

export const hrisProviderEnum = z.enum(["hibob", "bamboohr", "darwinbox", "keka", "workday"]);

export const hrisSyncModeEnum = z.enum(["dry_run", "live"]);

export const runHrisSyncSchema = z
  .object({
    provider: hrisProviderEnum,
    mode: hrisSyncModeEnum.default("dry_run"),
  })
  .strict();

export const listHrisSyncRunsSchema = z
  .object({
    provider: hrisProviderEnum.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export type HrisProvider = z.infer<typeof hrisProviderEnum>;
export type HrisSyncMode = z.infer<typeof hrisSyncModeEnum>;
