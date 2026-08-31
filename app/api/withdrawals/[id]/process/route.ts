import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

type WithdrawalRow = { id: string; type: string; status: string | null; amount: number };

/**
 * POST /api/withdrawals/[id]/process — flip a pending withdrawal to processed
 * (sandbox "bank processing"). Only the owner's pending withdrawals.
 */
export async function POST(_req: Request, { params }: Params) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const { id } = await params;

  const res = await supabaseFetch<WithdrawalRow[]>(
    `/rest/v1/transactions?select=id,type,status,amount&id=eq.${id}&user_id=eq.${session.sub}&limit=1`
  );
  const tx = res.data?.[0];

  if (!tx) return json(404, { error: "Withdrawal not found" });
  if (tx.type !== "withdrawal") return json(400, { error: "Not a withdrawal" });
  if (tx.status !== "pending") return json(409, { error: "Withdrawal is not pending" });

  const upd = await supabaseFetch<WithdrawalRow[]>(
    `/rest/v1/transactions?select=id,status,amount&id=eq.${id}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "processed" }),
    }
  );

  if (upd.status !== 200) {
    return json(upd.status, { error: upd.error ?? "Could not process withdrawal" });
  }

  return json(200, { withdrawal: upd.data?.[0] });
}
