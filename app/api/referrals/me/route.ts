import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getReferralInfo } from "@/lib/referrals";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/** GET /api/referrals/me — referral code, referees, qualifying count. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const info = await getReferralInfo(session.sub);
  if (!info) return json(404, { error: "User not found" });

  return json(200, { referral: info });
}
