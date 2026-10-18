import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { retryPayout } from "@/lib/payouts";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/withdrawals/[id]/retry — admin retries a payout whose transfer
 * initiation failed. The original debit is still held, so this creates a new
 * payout attempt (new reference) without touching the balance again.
 */
export async function POST(_req: Request, { params }: Params) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const { id } = await params;
  const result = await retryPayout(id);
  if (!result.ok) return json(result.status, { error: result.error });

  const { withdrawal, payout, payoutUsd } = result.data;
  return json(200, { withdrawal, payout, payout_usd: payoutUsd });
}
