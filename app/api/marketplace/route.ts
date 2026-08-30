import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { deriveJobStatus, estimateDuration, maxPoolSize } from "@/lib/jobs";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type JobRow = {
  id: string;
  pay_per_hour: number;
  duration_hours: number;
  actual_duration_hours: number | null;
  starts_at: string;
  required_referrals: number;
  company: { name: string } | null;
  min_tier: { code: string; name: string } | null;
};

type AssignmentRow = { job: string; status: string };

/** GET /api/marketplace — open jobs (not yet started) with live pool info. */
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
    .filter((j) => new Date(j.starts_at).getTime() > now) // open = not started yet
    .map((j) => {
      const poolCount = pool.get(j.id) ?? 0;
      const estDuration = estimateDuration(j.duration_hours, poolCount);
      return {
        id: j.id,
        company: j.company?.name ?? "Unknown",
        tier: j.min_tier?.code ?? "",
        tier_name: j.min_tier?.name ?? "",
        pay_per_hour: j.pay_per_hour,
        duration_hours: j.duration_hours,
        starts_at: j.starts_at,
        required_referrals: j.required_referrals,
        pool_count: poolCount,
        max_pool: maxPoolSize(j.pay_per_hour, j.duration_hours),
        estimated_duration: estDuration,
        estimated_earnings: Number((j.pay_per_hour * estDuration).toFixed(2)),
        status: deriveJobStatus(j.starts_at, j.duration_hours, now),
      };
    });

  return json(200, { jobs });
}
