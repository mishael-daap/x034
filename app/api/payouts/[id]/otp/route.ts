import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { paystackFinalizeTransfer } from "@/lib/paystack";
import { fetchPayout, settlePayout } from "@/lib/payouts";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/payouts/[id]/otp — finalize a transfer when the Paystack account
 * still requires OTP confirmation (payout status `otp_required`). The OTP is
 * sent by Paystack to the business phone number. After finalizing, the payout
 * is settled through the normal verify path.
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
  const otp = typeof body.otp === "string" ? body.otp.trim() : "";
  if (!/^\d{4,8}$/.test(otp)) return json(400, { error: "Enter the OTP Paystack sent you" });

  const payout = await fetchPayout(id);
  if (!payout) return json(404, { error: "Payout not found" });
  if (payout.status !== "otp_required" || !payout.transfer_code) {
    return json(409, { error: "This payout is not waiting for an OTP" });
  }

  try {
    await paystackFinalizeTransfer({ transferCode: payout.transfer_code, otp });
  } catch (err) {
    return json(400, {
      error: err instanceof Error ? err.message : "Paystack rejected the OTP",
    });
  }

  const result = await settlePayout(payout.reference);
  if (!result.ok) return json(result.status, { error: result.error });

  const refreshed = await fetchPayout(id);
  return json(200, { payout: refreshed, settlement: result.data });
}
