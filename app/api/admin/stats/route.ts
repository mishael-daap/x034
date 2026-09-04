import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { PLATFORM_USER_ID } from "@/lib/constants";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/**
 * GET /api/admin/stats — platform metrics (admin only).
 *   total_users            users with role 'user' (platform account excluded)
 *   total_nodes            all nodes
 *   platform_balance       user_balances for the platform account
 *   platform_revenue       Σ node_sale + platform_earnings (sales + platform cut)
 *   pending_withdrawals    count of pending requests
 *   pending_payout_total   Σ pending withdrawals.amount ("amount to be paid out")
 *   open_jobs              jobs with status 'open'
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const [usersRes, nodesRes, jobsRes, balanceRes, revenueRes, pendingRes] =
    await Promise.all([
      supabaseFetch<{ id: string }[]>(`/rest/v1/users?select=id&role=eq.user`),
      supabaseFetch<{ id: string }[]>(`/rest/v1/nodes?select=id`),
      supabaseFetch<{ id: string }[]>(`/rest/v1/jobs?select=id&status=eq.open`),
      supabaseFetch<{ balance: number }[]>(
        `/rest/v1/user_balances?select=balance&user_id=eq.${PLATFORM_USER_ID}`
      ),
      supabaseFetch<{ amount: number }[]>(
        `/rest/v1/transactions?select=amount&user_id=eq.${PLATFORM_USER_ID}&type=in.(node_sale,platform_earnings)`
      ),
      supabaseFetch<{ amount: number }[]>(
        `/rest/v1/withdrawals?select=amount&status=eq.pending`
      ),
    ]);

  const revenue =
    revenueRes.status === 200
      ? (revenueRes.data ?? []).reduce((sum, t) => sum + Number(t.amount), 0)
      : 0;
  const pending =
    pendingRes.status === 200 ? (pendingRes.data ?? []) : [];
  const pendingTotal = pending.reduce((sum, w) => sum + Number(w.amount), 0);

  const stats = {
    total_users: usersRes.status === 200 ? (usersRes.data ?? []).length : 0,
    total_nodes: nodesRes.status === 200 ? (nodesRes.data ?? []).length : 0,
    platform_balance:
      balanceRes.status === 200 && balanceRes.data?.length
        ? Number(balanceRes.data[0].balance ?? 0)
        : 0,
    platform_revenue: Math.round(revenue * 100) / 100,
    pending_withdrawals: pending.length,
    pending_payout_total: Math.round(pendingTotal * 100) / 100,
    open_jobs: jobsRes.status === 200 ? (jobsRes.data ?? []).length : 0,
  };

  return json(200, { stats });
}
