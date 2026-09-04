import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const money = (n: number) => Math.round(n * 100) / 100;

type ProfileRow = { name: string; bank: string | null; account_number: string | null };
type BalanceRow = { balance: number };

type WithdrawalRow = {
  id: string;
  amount: number;
  status: string;
  reason: string | null;
  account_number: string | null;
  created_at: string;
  decided_at: string | null;
  bank: { name: string } | null;
};

/**
 * POST /api/withdrawals — request a withdrawal (roadmap 5.1). Creates a
 * `pending` row in `withdrawals` with the destination account snapshotted from
 * the user's profile. Money only moves when an admin approves it (see
 * /api/withdrawals/[id]/decision).
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

  // Destination comes from the profile; require it before a request is allowed.
  const profileRes = await supabaseFetch<ProfileRow[]>(
    `/rest/v1/users?select=name,bank,account_number&id=eq.${session.sub}&limit=1`
  );
  const profile = profileRes.data?.[0];
  if (!profile) return json(404, { error: "User not found" });
  if (!profile.bank || !profile.account_number) {
    return json(400, {
      error: "Add your bank and account number on your profile first",
    });
  }

  // Request-time gate: must be covered by the current available balance.
  const balanceRes = await supabaseFetch<BalanceRow[]>(
    `/rest/v1/user_balances?select=balance&user_id=eq.${session.sub}`
  );
  const balance =
    balanceRes.status === 200 && balanceRes.data?.length
      ? Number(balanceRes.data[0].balance ?? 0)
      : 0;
  if (amount > balance) {
    return json(400, { error: "Insufficient balance" });
  }

  const res = await supabaseFetch<WithdrawalRow[]>(
    `/rest/v1/withdrawals?select=id,amount,status,reason,account_number,created_at,decided_at,bank:banks(name)`,
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: session.sub,
        amount: money(amount),
        status: "pending",
        bank: profile.bank,
        account_number: profile.account_number,
        account_name: profile.name,
      }),
    }
  );

  if (res.status !== 201 || !res.data?.[0]) {
    return json(res.status, { error: res.error ?? "Could not create withdrawal" });
  }

  return json(201, { withdrawal: res.data[0] });
}

/** GET /api/withdrawals — the signed-in user's requests, newest first. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const res = await supabaseFetch<WithdrawalRow[]>(
    `/rest/v1/withdrawals?select=id,amount,status,reason,account_number,created_at,decided_at,bank:banks(name)&user_id=eq.${session.sub}&order=created_at.desc`
  );

  if (res.status !== 200) return json(res.status, { error: res.error });

  const withdrawals = (res.data ?? []).map((w) => ({
    id: w.id,
    amount: Number(w.amount),
    status: w.status,
    reason: w.reason,
    bank_name: w.bank?.name ?? null,
    account_number: w.account_number,
    created_at: w.created_at,
    decided_at: w.decided_at,
  }));

  return json(200, { withdrawals });
}
