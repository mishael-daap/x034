import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { approveWithdrawal, declineWithdrawal } from "@/lib/payouts";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/withdrawals/[id]/decision — admin approves or declines a pending
 * withdrawal. An approval fires a real Paystack transfer (roadmap 6):
 * balance check → destination re-check → payout record → ledger debit →
 * transfer. The request becomes `processing` until the transfer settles.
 * Declining moves no money.
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

  if (action === "approve") {
    const result = await approveWithdrawal(id, session.sub);
    if (!result.ok) return json(result.status, { error: result.error });
    const { declined, withdrawal, payout, payoutUsd, commission } = result.data;
    return json(200, {
      withdrawal,
      payout,
      payout_usd: payoutUsd,
      commission,
      declined: Boolean(declined),
    });
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 300)
      : undefined;
  const result = await declineWithdrawal(id, session.sub, reason);
  if (!result.ok) return json(result.status, { error: result.error });
  return json(200, { withdrawal: result.data });
}
