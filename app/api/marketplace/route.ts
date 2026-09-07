import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { deriveJobStatus, estimateDuration, estimateEarnings, maxPoolSize } from "@/lib/jobs";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type JobRow = {
  id: string;
  total_payout: number;
  duration_hours: number;
  actual_duration_hours: number | null;
  starts_at: string;
  required_referrals: number;
  company: { name: string } | null;
  min_tier: { code: string; name: string } | null;
};

type AssignmentRow = { job: string; status: string };

const STATUS_RANK: Record<string, number> = { upcoming: 0, locked: 1, in_progress: 2 };

/**
 * GET /api/marketplace — the live board, with pool info.
 *
 * Shows every job that is not finished yet: upcoming (pool open), locked (final
 * hour before start — frozen) and in_progress (running). A job drops off the
 * board once its pool has elapsed/completed, so a committed node stays visible
 * (read-only) while it is working rather than vanishing at start.
 */
export async function GET() {
  const jobsRes = await supabaseFetch<JobRow[]>(
    `/rest/v1/jobs?select=*,company:companies(name),min_tier:node_tiers(code,name)&order=starts_at`
  );
  if (jobsRes.status !== 200) return json(jobsRes.status, { error: jobsRes.error });

  // Pool counts: a job's current pool = its committed/active assignments.
  const assignRes = await supabaseFetch<AssignmentRow[]>(`/rest/v1/assignments?select=job,status`);
  const pool = new Map<string, number>();
  if (assignRes.status === 200 && assignRes.data) {
    for (const a of assignRes.data) {
      if (a.status === "committed" || a.status === "active") {
        pool.set(a.job, (pool.get(a.job) ?? 0) + 1);
      }
    }
  }

  const now = Date.now();
  const jobs = (jobsRes.data ?? [])
    .map((j) => {
      const poolCount = pool.get(j.id) ?? 0;
      const estDuration = estimateDuration(j.duration_hours, poolCount);
      // Once a job has started, its end is the realized duration; before that
      // (upcoming/locked) the duration is irrelevant to the status boundary.
      const realizedDuration = j.actual_duration_hours ?? estDuration;
      return {
        id: j.id,
        company: j.company?.name ?? "Unknown",
        tier: j.min_tier?.code ?? "",
        tier_name: j.min_tier?.name ?? "",
        total_payout: j.total_payout,
        duration_hours: j.duration_hours,
        starts_at: j.starts_at,
        required_referrals: j.required_referrals,
        pool_count: poolCount,
        max_pool: maxPoolSize(j.total_payout),
        estimated_duration: estDuration,
        estimated_earnings: Number(estimateEarnings(j.total_payout, poolCount).toFixed(2)),
        status: deriveJobStatus(j.starts_at, realizedDuration, now),
      };
    })
    .filter((j) => j.status !== "completed")
    .sort(
      (a, b) =>
        (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) ||
        a.starts_at.localeCompare(b.starts_at)
    );

  return json(200, { jobs });
}
