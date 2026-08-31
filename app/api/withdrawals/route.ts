import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/**
 * POST /api/withdrawals — request a withdrawal (2-step: pending → processed).
 * Body: { amount } — must be ≤ available balance (pending withdrawals excluded).
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

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return json(400, { error: "Enter a valid withdrawal amount" });
  }

  const balanceRes = await supabaseFetch<{ balance: number }[]>(
    `/rest/v1/user_balances?select=balance&user_id=eq.${session.sub}`
  );
  const balance =
    balanceRes.status === 200 && balanceRes.data?.length
      ? Number(balanceRes.data[0].balance ?? 0)
      : 0;

  if (amount > balance) {
    return json(400, { error: "Insufficient balance" });
  }

  const res = await supabaseFetch<{ id: string; status: string; amount: number }[]>(
    `/rest/v1/transactions?select=id,status,amount`,
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: session.sub,
        type: "withdrawal",
        amount: -Math.round(amount * 100) / 100,
        status: "pending",
      }),
    }
  );

  if (res.status !== 201) {
    return json(res.status, { error: res.error ?? "Could not create withdrawal" });
  }

  return json(201, { withdrawal: res.data?.[0] });
}
