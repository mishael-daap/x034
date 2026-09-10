import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import {
  DEFAULT_WITHDRAWAL_POLICY,
  normalizeWithdrawalPolicy,
  withdrawalPolicyState,
  type WithdrawalPolicy,
} from "@/lib/withdrawal-policy";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type SettingRow = { key: string; value: unknown };

async function requireAdmin(): Promise<Response | null> {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });
  return null;
}

/**
 * GET /api/admin/withdrawal-policy — the configured withdrawal window (admin).
 * PATCH — replace it. Modes: open | scheduled | recurring | disabled.
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const res = await supabaseFetch<SettingRow[]>(
    `/rest/v1/app_settings?key=eq.withdrawal_policy&limit=1`
  );
  const raw = res.status === 200 && res.data?.length ? res.data[0].value : null;
  const policy = normalizeWithdrawalPolicy(raw ?? DEFAULT_WITHDRAWAL_POLICY);
  return json(200, { policy, state: withdrawalPolicyState(policy) });
}

export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const policy = normalizeWithdrawalPolicy(body);

  const error = validatePolicy(policy);
  if (error) return json(400, { error });

  const res = await supabaseFetch(`/rest/v1/app_settings?key=eq.withdrawal_policy`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ key: "withdrawal_policy", value: policy }),
  });
  if (res.status >= 400) {
    return json(res.status, { error: res.error ?? "Could not save withdrawal policy" });
  }

  return json(200, { ok: true, policy, state: withdrawalPolicyState(policy) });
}

function validatePolicy(policy: WithdrawalPolicy): string | null {
  if (policy.mode === "scheduled" || policy.mode === "recurring") {
    if (!policy.boundary_start) return "Pick when the schedule starts";
    if (!policy.boundary_end) return "Pick when the schedule ends";
    if (
      new Date(policy.boundary_end).getTime() <
      new Date(policy.boundary_start).getTime()
    ) {
      return "The schedule must end on or after it starts";
    }
    if (minutesOf(policy.day_end) <= minutesOf(policy.day_start)) {
      return "The closing time must be after the opening time";
    }
  }

  if (policy.mode === "recurring") {
    if (!Number.isInteger(policy.interval) || policy.interval < 1) {
      return "Interval must be a whole number of at least 1";
    }
  }

  return null;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
