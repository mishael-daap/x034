import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { resolveJobCompany } from "@/lib/companies";
import { completeElapsedJobs } from "@/lib/lock";
import { maxPoolSize } from "@/lib/jobs";
import {
  decimalError,
  startsAtError,
  timezoneIsoError,
  wholeNumberError,
  JOB_DURATION_MAX,
  JOB_DURATION_MIN,
  JOB_PAYOUT_MAX,
  JOB_PAYOUT_MIN,
} from "@/lib/validation";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type JobRow = {
  id: string;
  total_payout: number;
  duration_hours: number;
  starts_at: string;
  required_referrals: number;
  status: string;
  actual_duration_hours: number | null;
  company: { id: string; name: string } | null;
  min_tier: { id: string; code: string; name: string } | null;
};

const JOB_SELECT = `id,company:companies(id,name),min_tier:node_tiers(id,code,name),total_payout,duration_hours,starts_at,required_referrals,status,actual_duration_hours`;

/** GET /api/admin/jobs — all jobs (any status), ordered by start time. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  // Settle any finished jobs so the admin always sees an accurate status.
  await completeElapsedJobs();

  const res = await supabaseFetch<JobRow[]>(
    `/rest/v1/jobs?select=${JOB_SELECT}&order=starts_at`
  );
  if (res.status !== 200) return json(res.status, { error: res.error });

  // How many nodes sit in each pool (including finished jobs' history).
  const assignRes = await supabaseFetch<{ job: string }[]>(
    `/rest/v1/assignments?select=job&limit=100000`
  );
  const pool = new Map<string, number>();
  for (const a of assignRes.status === 200 ? (assignRes.data ?? []) : []) {
    pool.set(a.job, (pool.get(a.job) ?? 0) + 1);
  }

  const jobs = (res.data ?? []).map((j) => ({
    id: j.id,
    company_id: j.company?.id ?? null,
    company: j.company?.name ?? "Unknown",
    tier_id: j.min_tier?.id ?? null,
    tier: j.min_tier?.code ?? "",
    tier_name: j.min_tier?.name ?? "",
    total_payout: Number(j.total_payout),
    duration_hours: Number(j.duration_hours),
    starts_at: j.starts_at,
    required_referrals: Number(j.required_referrals),
    status: j.status,
    actual_duration_hours: j.actual_duration_hours,
    pool_count: pool.get(j.id) ?? 0,
    max_pool: maxPoolSize(Number(j.total_payout)),
  }));

  return json(200, { jobs });
}

/** POST /api/admin/jobs — create a job. */
export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const tierId = typeof body.tier_id === "string" ? body.tier_id.trim() : "";
  const startsAt = typeof body.starts_at === "string" ? body.starts_at.trim() : "";
  const str = (v: unknown) => (v == null ? "" : String(v));

  const checks: (string | null)[] = [
    tierId ? null : "Select a node option",
    decimalError(str(body.total_payout), {
      label: "Payout pot",
      min: JOB_PAYOUT_MIN,
      max: JOB_PAYOUT_MAX,
    }),
    decimalError(str(body.duration_hours), {
      label: "Duration",
      min: JOB_DURATION_MIN,
      max: JOB_DURATION_MAX,
    }),
    wholeNumberError(str(body.required_referrals), { label: "Referrals required", min: 0 }),
    startsAtError(startsAt),
    timezoneIsoError(startsAt),
  ];
  const firstError = checks.find((c): c is string => c !== null);
  if (firstError) return json(400, { error: firstError });

  // Company: an existing id, or a typed name that is saved to the list.
  const company = await resolveJobCompany(body);
  if ("missing" in company) {
    return json(400, { error: "Enter or pick a company" });
  }
  if ("error" in company) {
    return json(400, { error: company.error });
  }

  const res = await supabaseFetch<JobRow[]>(`/rest/v1/jobs?select=id`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company: company.id,
      min_tier: tierId,
      total_payout: Math.round(Number(body.total_payout) * 100) / 100,
      duration_hours: Number(body.duration_hours),
      starts_at: new Date(startsAt).toISOString(),
      required_referrals: Number(body.required_referrals),
      status: "open",
    }),
  });

  if (res.status !== 201 || !res.data?.[0]) {
    const msg =
      (res.error ?? "").includes("jobs_company_fkey") ||
      (res.error ?? "").includes("jobs_min_tier_fkey")
        ? "Pick a valid company and node option"
        : res.error ?? "Could not create job";
    return json(res.status, { error: msg });
  }
  return json(201, { job: res.data[0].id });
}
