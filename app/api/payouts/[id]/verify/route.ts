import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { fetchPayout, settlePayout } from "@/lib/payouts";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/payouts/[id]/verify — admin "Check status". Asks Paystack for the
 * transfer's final state and settles it through the same idempotent path the
 * webhook uses. This is also the confirmation route for local development,
 * where webhooks cannot reach localhost.
 */
export async function POST(_req: Request, { params }: Params) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const { id } = await params;
  const payout = await fetchPayout(id);
  if (!payout) return json(404, { error: "Payout not found" });

  const result = await settlePayout(payout.reference);
  if (!result.ok) return json(result.status, { error: result.error });

  const refreshed = await fetchPayout(id);
  const withdrawal = await supabaseFetch<{ id: string; status: string }[]>(
    `/rest/v1/withdrawals?select=id,status&id=eq.${payout.withdrawal_id}&limit=1`
  );

  return json(200, {
    payout: refreshed,
    settlement: result.data,
    withdrawal: withdrawal.data?.[0] ?? null,
  });
}
