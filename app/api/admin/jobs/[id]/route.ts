import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { COMMIT_WINDOW_HOURS } from "@/lib/constants";
import { finalizeJobLock } from "@/lib/lock";
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

type JobRow = { id: string; starts_at: string; status: string; actual_duration_hours: number | null };
type CountRow = { count: number };

type Params = { params: Promise<{ id: string }> };

/** Hours a reopened job is pushed out so users get a commit window again. */
const REOPEN_HORIZON_HOURS = 3;

/**
 * PATCH /api/admin/jobs/[id] — edit an upcoming job (not yet started),
 * lock it (start it now and freeze the pool), or reopen it for commits.
 * DELETE — remove a job that has no committed nodes yet.
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const jobRes = await supabaseFetch<JobRow[]>(
    `/rest/v1/jobs?select=id,starts_at,status,actual_duration_hours&id=eq.${id}&limit=1`
  );
  const job = jobRes.data?.[0];
  if (!job) return json(404, { error: "Job not found" });

  // ── Admin lifecycle actions (checked before the edit guard) ──────────────
  if (body.action === "lock") {
    // "Lock now": start the job immediately — pull the start to now if it's
    // still scheduled in the future, then finalize the pool lock (realized
    // duration, assignments active, earnings booked). Safe for any job whose
    // earnings haven't been locked yet.
    if (job.status !== "open") {
      return json(409, { error: "Only open jobs can be locked" });
    }
    if (job.actual_duration_hours != null) {
      return json(409, { error: "This job is already locked" });
    }
    if (new Date(job.starts_at).getTime() > Date.now()) {
      const res = await supabaseFetch(`/rest/v1/jobs?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ starts_at: new Date().toISOString() }),
      });
      if (res.status >= 400) {
        return json(502, { error: res.error ?? "Could not lock job" });
      }
    }
    const lock = await finalizeJobLock(id);
    if (!lock.locked) {
      return json(409, { error: lock.error ?? "Could not lock job" });
    }
    return json(200, {
      ok: true,
      action: "lock",
      pool_size: lock.pool_size,
      actual_duration_hours: lock.actual_duration_hours,
      earnings_amount: lock.earnings_amount,
    });
  }

  if (body.action === "open") {
    // "Reopen": make a job joinable again by rescheduling its start far
    // enough out that the commit window is open. Only jobs whose earnings
    // were never locked (actual_duration_hours still null) can reopen — a
    // job that already locked its pool can't be rewound.
    if (job.status !== "open") {
      return json(409, {
        error:
          "A locked job can't be reopened — its pool earnings were already booked. Create a new job instead.",
      });
    }
    if (job.actual_duration_hours != null) {
      return json(409, { error: "This job already locked its earnings and can't be reopened" });
    }
    const now = Date.now();
    const cutoff = new Date(job.starts_at).getTime() - COMMIT_WINDOW_HOURS * 3_600_000;
    if (now < cutoff) {
      return json(409, { error: "This job is already open for commits" });
    }
    const res = await supabaseFetch(`/rest/v1/jobs?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "open",
        starts_at: new Date(now + REOPEN_HORIZON_HOURS * 3_600_000).toISOString(),
      }),
    });
    if (res.status >= 400) {
      return json(502, { error: res.error ?? "Could not reopen job" });
    }
    return json(200, { ok: true, action: "open" });
  }

  // ── Field edits: a job that has started is locked — never edit mid-flight.
  if (job.status !== "open" || new Date(job.starts_at).getTime() <= Date.now()) {
    return json(409, { error: "This job has already started and can no longer be edited" });
  }

  const str = (v: unknown) => (v == null ? "" : String(v));
  const updates: Record<string, unknown> = {};

  if ("company_id" in body) {
    const v = str(body.company_id).trim();
    if (!v) return json(400, { error: "Select a company" });
    updates.company = v;
  }
  if ("tier_id" in body) {
    const v = str(body.tier_id).trim();
    if (!v) return json(400, { error: "Select a node option" });
    updates.min_tier = v;
  }
  if ("total_payout" in body) {
    const err = decimalError(str(body.total_payout), {
      label: "Payout pot",
      min: JOB_PAYOUT_MIN,
      max: JOB_PAYOUT_MAX,
    });
    if (err) return json(400, { error: err });
    updates.total_payout = Math.round(Number(body.total_payout) * 100) / 100;
  }
  if ("duration_hours" in body) {
    const err = decimalError(str(body.duration_hours), {
      label: "Duration",
      min: JOB_DURATION_MIN,
      max: JOB_DURATION_MAX,
    });
    if (err) return json(400, { error: err });
    updates.duration_hours = Number(body.duration_hours);
  }
  if ("required_referrals" in body) {
    const err = wholeNumberError(str(body.required_referrals), {
      label: "Referrals required",
      min: 0,
    });
    if (err) return json(400, { error: err });
    updates.required_referrals = Number(body.required_referrals);
  }
  if ("starts_at" in body) {
    const v = str(body.starts_at).trim();
    const err = startsAtError(v) ?? timezoneIsoError(v);
    if (err) return json(400, { error: err });
    updates.starts_at = new Date(v).toISOString();
  }

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
