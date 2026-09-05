import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type TransactionRow = {
  id: string;
  type: string;
  amount: number;
  status: string | null;
  created_at: string;
  reference: { job: { company: { name: string } | null } | null } | null;
};

/** GET /api/transactions — the signed-in user's balance + full ledger. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const balanceRes = await supabaseFetch<{ balance: number }[]>(
    `/rest/v1/user_balances?select=balance&user_id=eq.${session.sub}`
  );
  const balance =
    balanceRes.status === 200 && balanceRes.data?.length
      ? Number(balanceRes.data[0].balance ?? 0)
      : 0;

  const txRes = await supabaseFetch<TransactionRow[]>(
    `/rest/v1/transactions?select=*,reference:assignments(job:jobs(company:companies(name)))&user_id=eq.${session.sub}&order=created_at.desc`
  );

  const rows = txRes.status === 200 ? txRes.data ?? [] : [];

  // Lifetime income = everything the user has earned (job earnings + referral
  // commissions). Deposits (funding) and own payments are not income.
  const total_income = Number(
    rows
      .filter((t) => t.type === "earnings" || t.type === "referral")
      .reduce((sum, t) => sum + Number(t.amount), 0)
      .toFixed(2)
  );

  const transactions = rows.map((t) => ({
    id: t.id,
    type: t.type,
    amount: Number(t.amount),
    status: t.status,
    created_at: t.created_at,
    company: t.reference?.job?.company?.name ?? null,
  }));

  return json(200, { balance, total_income, transactions });
}
