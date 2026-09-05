import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/**
 * POST /api/deposits — add test funds to the caller's wallet.
 *
 * Sandbox behaviour: any positive amount is credited immediately (test
 * currency, no cap). The ledger row uses the `funding` type — the same
 * "external money in" credit Paystack writes before a purchase — so it counts
 * toward `user_balances` right away and never looks like income.
 */
export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const parsed = Number(body.amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return json(400, { error: "Enter a deposit amount greater than zero" });
  }
  const amount = Math.round(parsed * 100) / 100;
  if (amount <= 0) return json(400, { error: "Enter a deposit amount greater than zero" });

  const res = await supabaseFetch(`/rest/v1/transactions`, {
    method: "POST",
    body: JSON.stringify({ user_id: session.sub, type: "funding", amount }),
  });
  if (res.status !== 201) {
    return json(res.status, { error: res.error ?? "Could not complete deposit" });
  }

  const balanceRes = await supabaseFetch<{ balance: number }[]>(
    `/rest/v1/user_balances?select=balance&user_id=eq.${session.sub}`
  );
  const balance =
    balanceRes.status === 200 && balanceRes.data?.length
      ? Number(balanceRes.data[0].balance ?? 0)
      : 0;

  return json(200, { balance, amount });
}
