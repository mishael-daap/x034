import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const money = (n: number) => Math.round(n * 100) / 100;

type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  reason: string | null;
};

type BalanceRow = { balance: number };

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/withdrawals/[id]/decision — admin approves or declines a pending
 * withdrawal (roadmap 5.1). Admin = users.role 'admin' (the platform account).
 *
 * approve: re-check the requester's available balance — if it no longer covers
 *   the amount the request is declined ("Insufficient balance") with no ledger
 *   row; otherwise a ledger `withdrawal` row (−amount, processed) is created
 *   and the request flips to approved. A failed ledger insert leaves it
 *   pending so the decision can be retried.
 * decline: flips to declined with an optional reason. No money ever moves.
 */
export async function POST(req: Request, { params }: Params) {
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
  const action = body.action;
  if (action !== "approve" && action !== "decline") {
    return json(400, { error: "action must be 'approve' or 'decline'" });
  }
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 300)
      : null;

  const wRes = await supabaseFetch<WithdrawalRow[]>(
    `/rest/v1/withdrawals?select=id,user_id,amount,status,reason&id=eq.${id}&limit=1`
  );
  const withdrawal = wRes.data?.[0];
  if (!withdrawal) return json(404, { error: "Withdrawal not found" });
  if (withdrawal.status !== "pending") {
    return json(409, { error: "Withdrawal already decided" });
  }

  const amount = Number(withdrawal.amount);
  const decidedAt = new Date().toISOString();
  const decided = { decided_at: decidedAt, decided_by: session.sub };

  if (action === "approve") {
    // Approval-time balance check: decline if the request is no longer covered.
    const balanceRes = await supabaseFetch<BalanceRow[]>(
      `/rest/v1/user_balances?select=balance&user_id=eq.${withdrawal.user_id}`
    );
    const balance =
      balanceRes.status === 200 && balanceRes.data?.length
        ? Number(balanceRes.data[0].balance ?? 0)
        : 0;

    if (balance < amount) {
      return decline("Insufficient balance");
    }

    const txRes = await supabaseFetch(`/rest/v1/transactions`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: withdrawal.user_id,
        type: "withdrawal",
        amount: -money(amount),
        status: "processed",
      }),
    });
    if (txRes.status !== 201) {
      return json(502, {
        error: txRes.error ?? "Could not process withdrawal — please retry",
      });
    }

    const upd = await patchWithdrawal({ status: "approved", ...decided });
    if (!upd) return json(502, { error: "Could not update withdrawal" });
    return json(200, { withdrawal: upd });
  }

  return decline(reason ?? undefined);

  async function decline(reasonText?: string) {
    const upd = await patchWithdrawal({
      status: "declined",
      reason: reasonText ?? null,
      ...decided,
    });
    if (!upd) return json(502, { error: "Could not update withdrawal" });
    return json(200, { withdrawal: upd });
  }

  async function patchWithdrawal(fields: Record<string, unknown>) {
    const res = await supabaseFetch<WithdrawalRow[]>(
      `/rest/v1/withdrawals?select=id,user_id,amount,status,reason&id=eq.${id}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(fields),
      }
    );
    return res.data?.[0] ?? null;
  }
}
