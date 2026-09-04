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

/** GET /api/admin/withdrawals — all requests (admin only), optional ?status= filter. */
export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const validStatus = status === "pending" || status === "approved" || status === "declined";

  const path =
    `/rest/v1/withdrawals?select=id,amount,status,reason,account_number,account_name,created_at,decided_at,bank:banks(name),user:users!withdrawals_user_id_fkey(id,name,email)` +
    (validStatus ? `&status=eq.${status}` : "") +
    `&order=created_at.desc`;

  const res = await supabaseFetch<AdminWithdrawalRow[]>(path);
  if (res.status !== 200) return json(res.status, { error: res.error });

  const withdrawals = (res.data ?? []).map((w) => ({
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
  }));

  return json(200, { withdrawals });
}
