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
  starts_at: string;
  status: string;
};

type CountRow = { count: number };

type Params = { params: Promise<{ id: string }> };

function readNumber(body: Record<string, unknown>, key: string, min: number): number | null {
  if (!(key in body)) return null;
  const n = Number(body[key]);
  if (!Number.isFinite(n) || n < min) return null;
  return money(n);
}

/**
 * PATCH /api/admin/jobs/[id] — edit an upcoming job (not yet started).
 * DELETE — remove a job that has no committed nodes yet.
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const { id } = await params;

  const jobRes = await supabaseFetch<JobRow[]>(
    `/rest/v1/jobs?select=id,starts_at,status&id=eq.${id}&limit=1`
  );
  const job = jobRes.data?.[0];
  if (!job) return json(404, { error: "Job not found" });

  // A job that has started is locked — never edit it mid-flight.
  if (job.status !== "open" || new Date(job.starts_at).getTime() <= Date.now()) {
    return json(409, { error: "This job has already started and can no longer be edited" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.company_id === "string" && body.company_id.trim()) {
    updates.company = body.company_id.trim();
  }
  if (typeof body.tier_id === "string" && body.tier_id.trim()) {
    updates.min_tier = body.tier_id.trim();
  }
  if (typeof body.starts_at === "string" && body.starts_at.trim()) {
    const t = Date.parse(body.starts_at);
    if (Number.isNaN(t)) return json(400, { error: "starts_at is invalid" });
    updates.starts_at = new Date(t).toISOString();
  }
  const payout = readNumber(body, "total_payout", PLATFORM_EARNINGS_FLOOR);
  if (payout !== null) updates.total_payout = payout;
  const duration = readNumber(body, "duration_hours", 0.1);
  if (duration !== null) updates.duration_hours = duration;
  const referrals = readNumber(body, "required_referrals", 0);
  if (referrals !== null) updates.required_referrals = referrals;

  if (Object.keys(updates).length === 0) {
    return json(400, { error: "Nothing to update" });
  }

  const res = await supabaseFetch(`/rest/v1/jobs?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (res.status >= 400) {
    return json(res.status, { error: res.error ?? "Could not update job" });
  }
  return json(200, { ok: true });
}

/** DELETE /api/admin/jobs/[id] — only while nobody has committed a node. */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const { id } = await params;

  const assignRes = await supabaseFetch<CountRow[]>(
    `/rest/v1/assignments?select=id&job=eq.${id}`
  );
  const assigned = assignRes.status === 200 ? (assignRes.data ?? []) : [];
  if (assigned.length > 0) {
    return json(409, {
      error: `This job already has ${assigned.length} node(s) committed and cannot be removed`,
    });
  }

  const res = await supabaseFetch(`/rest/v1/jobs?id=eq.${id}`, { method: "DELETE" });
  if (res.status >= 400) {
    return json(res.status, { error: res.error ?? "Could not remove job" });
  }
  return json(200, { ok: true });
}
