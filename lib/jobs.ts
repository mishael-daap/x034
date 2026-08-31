import { COMMIT_WINDOW_HOURS, PLATFORM_EARNINGS_FLOOR } from "@/lib/constants";

export type JobStatus = "upcoming" | "commit_window" | "in_progress" | "completed";

/** Tier ordering: C (lowest) → B → A (highest). */
export const TIER_RANK: Record<string, number> = { C: 1, B: 2, A: 3 };

/** A node qualifies for a job when its tier is at least the job's tier. */
export function nodeQualifies(nodeTierCode: string, jobTierCode: string): boolean {
  return (TIER_RANK[nodeTierCode] ?? 0) >= (TIER_RANK[jobTierCode] ?? 0);
}

/** Max pool size a job can accept before per-node earnings drop below the floor. */
export function maxPoolSize(payPerHour: number, durationHours: number): number {
  return Math.max(1, Math.floor((payPerHour * durationHours) / PLATFORM_EARNINGS_FLOOR));
}

/** Estimated (or realized) duration given the current pool size. */
export function estimateDuration(durationHours: number, poolSize: number): number {
  return durationHours / Math.max(poolSize, 1);
}

/**
 * Derived job status from time. `durationHours` should be the realized duration
 * (actual_duration_hours) once locked, else the current estimate.
 */
export function deriveJobStatus(
  startsAt: string,
  durationHours: number,
  now: number = Date.now()
): JobStatus {
  const start = new Date(startsAt).getTime();
  const end = start + durationHours * 3_600_000;
  if (now < start - COMMIT_WINDOW_HOURS * 3_600_000) return "upcoming";
  if (now < start) return "commit_window";
  if (now < end) return "in_progress";
  return "completed";
}
