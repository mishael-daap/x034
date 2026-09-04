import { COMMIT_WINDOW_HOURS, PLATFORM_EARNINGS_FLOOR } from "@/lib/constants";

export type JobStatus = "upcoming" | "locked" | "in_progress" | "completed";

/** Tier ordering: C (lowest) → B → A (highest). */
export const TIER_RANK: Record<string, number> = { C: 1, B: 2, A: 3 };

/** A node qualifies for a job when its tier is at least the job's tier. */
export function nodeQualifies(nodeTierCode: string, jobTierCode: string): boolean {
  return (TIER_RANK[nodeTierCode] ?? 0) >= (TIER_RANK[jobTierCode] ?? 0);
}

/**
 * Max pool size a job can accept before per-node earnings drop below the floor.
 * pot = total_payout; n_max = floor(pot ÷ platform floor).
 */
export function maxPoolSize(totalPayout: number): number {
  return Math.max(1, Math.floor(totalPayout / PLATFORM_EARNINGS_FLOOR));
}

/** Estimated (or realized) per-node earnings: the pot split across the pool. */
export function estimateEarnings(totalPayout: number, poolSize: number): number {
  return totalPayout / Math.max(poolSize, 1);
}

/** Estimated (or realized) duration given the current pool size. */
export function estimateDuration(durationHours: number, poolSize: number): number {
  return durationHours / Math.max(poolSize, 1);
}

/**
 * Derived job status from time. `durationHours` should be the realized duration
 * (actual_duration_hours) once locked, else the current estimate.
 *
 * upcoming:        more than 1h before start — pool open (commit/remove)
 * locked:          last hour before start — pool frozen (no joins/removes)
 * in_progress:     running (locked at start, earnings split at lock)
 * completed:       elapsed
 */
export function deriveJobStatus(
  startsAt: string,
  durationHours: number,
  now: number = Date.now()
): JobStatus {
  const start = new Date(startsAt).getTime();
  const end = start + durationHours * 3_600_000;
  const cutoff = lockCutoffMs(startsAt);
  if (now < cutoff) return "upcoming";
  if (now < start) return "locked";
  if (now < end) return "in_progress";
  return "completed";
}

/** The moment the pool freezes: COMMIT_WINDOW_HOURS before the job starts. */
export function lockCutoffMs(startsAt: string): number {
  return new Date(startsAt).getTime() - COMMIT_WINDOW_HOURS * 3_600_000;
}
