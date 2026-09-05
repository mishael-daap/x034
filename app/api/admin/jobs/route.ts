import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { PLATFORM_EARNINGS_FLOOR } from "@/lib/constants";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const money = (n: number) => Math.round(n * 100) / 100;

type JobRow = {
  id: string;
  total_payout: number;
  duration_hours: number;
  starts_at: string;
  required_referrals: number;
  status: string;
  company: { id: string; name: string } | null;
  min_tier: { id: string; code: string; name: string } | null;
};

const JOB_SELECT = `id,company:companies(id,name),min_tier:node_tiers(id,code,name),total_payout,duration_hours,starts_at,required_referrals,status`;

/** GET /api/admin/jobs — all jobs (any status), newest starts first. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const res = await supabaseFetch<JobRow[]>(
    `/rest/v1/jobs?select=${JOB_SELECT}&order=starts_at`
  );
  if (res.status !== 200) return json(res.status, { error: res.error });

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

  const companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";
  const tierId = typeof body.tier_id === "string" ? body.tier_id.trim() : "";
  const startsAt = typeof body.starts_at === "string" ? body.starts_at.trim() : "";
  const num = (key: string, min: number): number => {
    const n = Number(body[key]);
    if (!Number.isFinite(n) || n < min) throw new Error(`${key} must be at least ${min}`);
    return money(n);
  };

  let payout: number, duration: number, referrals: number;
  try {
    if (!companyId) throw new Error("company_id is required");
    if (!tierId) throw new Error("tier_id is required");
    if (!startsAt || Number.isNaN(Date.parse(startsAt))) throw new Error("starts_at is invalid");
    payout = num("total_payout", PLATFORM_EARNINGS_FLOOR);
    duration = num("duration_hours", 0.1);
    referrals = num("required_referrals", 0);
  } catch (err) {
    return json(400, { error: err instanceof Error ? err.message : "Invalid job fields" });
  }

  const res = await supabaseFetch<JobRow[]>(`/rest/v1/jobs?select=id`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company: companyId,
      min_tier: tierId,
      total_payout: payout,
      duration_hours: duration,
      starts_at: new Date(startsAt).toISOString(),
      required_referrals: referrals,
      status: "open",
    }),
  });

  if (res.status !== 201 || !res.data?.[0]) {
    const msg =
      (res.error ?? "").includes("jobs_company_fkey") || (res.error ?? "").includes("jobs_min_tier_fkey")
        ? "Pick a valid company and node option"
        : res.error ?? "Could not create job";
    return json(res.status, { error: msg });
  }
  return json(201, { job: res.data[0].id });
}
