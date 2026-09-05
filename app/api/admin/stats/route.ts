import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import {
  WITHDRAWAL_COMMISSION_SHARE,
  WITHDRAWAL_PAYOUT_SHARE,
} from "@/lib/constants";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /api/admin/stats — platform metrics (admin only).
 *   total_income        Σ user deposits (everything users have deposited)
 *   balance             total income minus approved payouts (90% of each) —
 *                       the other 10% commission stays in this balance
 *   commission_earned   Σ 10% commissions on approved withdrawals
 *   total_users         users with role 'user'
 *   total_nodes         all nodes owned by users
 *   pending_withdrawals count of pending payout requests
 *   open_jobs           jobs that haven't started yet
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const [usersRes, nodesRes, jobsRes, depositsRes, approvedRes, pendingRes] = await Promise.all([
    supabaseFetch<{ id: string }[]>(`/rest/v1/users?select=id&role=eq.user`),
    supabaseFetch<{ id: string }[]>(`/rest/v1/nodes?select=id`),
    supabaseFetch<{ id: string }[]>(`/rest/v1/jobs?select=id&status=eq.open`),
    supabaseFetch<{ amount: number }[]>(`/rest/v1/transactions?select=amount&type=eq.funding`),
    supabaseFetch<{ amount: number }[]>(`/rest/v1/withdrawals?select=amount&status=eq.approved`),
    supabaseFetch<{ amount: number }[]>(`/rest/v1/withdrawals?select=amount&status=eq.pending`),
  ]);

  const deposits = depositsRes.status === 200 ? (depositsRes.data ?? []) : [];
  const totalIncome = deposits.reduce((sum, t) => sum + Number(t.amount), 0);

  const approved = approvedRes.status === 200 ? (approvedRes.data ?? []) : [];
  const approvedTotal = approved.reduce((sum, w) => sum + Number(w.amount), 0);
  const payouts = approvedTotal * WITHDRAWAL_PAYOUT_SHARE;
  const commission = approvedTotal * WITHDRAWAL_COMMISSION_SHARE;

  const stats = {
    total_users: usersRes.status === 200 ? (usersRes.data ?? []).length : 0,
    total_nodes: nodesRes.status === 200 ? (nodesRes.data ?? []).length : 0,
    total_income: money(totalIncome),
    balance: money(totalIncome - payouts),
    commission_earned: money(commission),
    pending_withdrawals: pendingRes.status === 200 ? (pendingRes.data ?? []).length : 0,
    open_jobs: jobsRes.status === 200 ? (jobsRes.data ?? []).length : 0,
  };

  return json(200, { stats });
}
