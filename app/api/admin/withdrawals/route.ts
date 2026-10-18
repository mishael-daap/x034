import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type AdminWithdrawalRow = {
  id: string;
  amount: number;
  status: string;
  reason: string | null;
  account_number: string | null;
  account_name: string | null;
  created_at: string;
  decided_at: string | null;
  bank: { name: string } | null;
  user: { id: string; name: string; email: string | null } | null;
};

type AdminPayoutRow = {
  id: string;
  withdrawal_id: string;
  status: string;
  failure_reason: string | null;
  amount_usd: number;
  amount_kobo: number;
  transfer_code: string | null;
  fee_charged: number | null;
  attempt: number;
  refunded_at: string | null;
  created_at: string;
};

/** GET /api/admin/withdrawals — all requests (admin only), optional ?status= filter. */
export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const validStatus =
    status === "pending" ||
    status === "processing" ||
    status === "paid" ||
    status === "failed" ||
    status === "declined";

  const path =
    `/rest/v1/withdrawals?select=id,amount,status,reason,account_number,account_name,created_at,decided_at,bank:banks(name),user:users!withdrawals_user_id_fkey(id,name,email)` +
    (validStatus ? `&status=eq.${status}` : "") +
    `&order=created_at.desc`;

  const res = await supabaseFetch<AdminWithdrawalRow[]>(path);
  if (res.status !== 200) return json(res.status, { error: res.error });

  const rows = res.data ?? [];

  // Latest payout attempt per request (PostgREST can't order an embed).
  const payoutByWithdrawal = new Map<string, AdminPayoutRow>();
  if (rows.length > 0) {
    const ids = rows.map((w) => w.id).join(",");
    const payoutsRes = await supabaseFetch<AdminPayoutRow[]>(
      `/rest/v1/payouts?select=id,withdrawal_id,status,failure_reason,amount_usd,amount_kobo,transfer_code,fee_charged,attempt,refunded_at,created_at&withdrawal_id=in.(${ids})&order=created_at.desc`
    );
    for (const p of payoutsRes.data ?? []) {
      if (!payoutByWithdrawal.has(p.withdrawal_id)) payoutByWithdrawal.set(p.withdrawal_id, p);
    }
  }

  const withdrawals = rows.map((w) => {
    const payout = payoutByWithdrawal.get(w.id);
    return {
      id: w.id,
      amount: Number(w.amount),
      status: w.status,
      reason: w.reason,
      account_number: w.account_number,
      account_name: w.account_name,
      bank_name: w.bank?.name ?? null,
      created_at: w.created_at,
      decided_at: w.decided_at,
      requester: w.user ? { name: w.user.name, email: w.user.email } : null,
      payout: payout
        ? {
            id: payout.id,
            status: payout.status,
            failure_reason: payout.failure_reason,
            amount_usd: Number(payout.amount_usd),
            amount_kobo: Number(payout.amount_kobo),
            transfer_code: payout.transfer_code,
            fee_charged: payout.fee_charged == null ? null : Number(payout.fee_charged),
            attempt: payout.attempt,
            refunded: Boolean(payout.refunded_at),
          }
        : null,
    };
  });

  return json(200, { withdrawals });
}
