import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getReferralInfo } from "@/lib/referrals";
import { supabaseFetch } from "@/lib/supabase";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type CommissionRow = {
  id: string;
  amount: number;
  created_at: string;
  node: {
    owner: { name: string } | null;
    tier: { name: string } | null;
  } | null;
};

/** GET /api/referrals/me — referral code, referees, qualifying count, commission earnings. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const info = await getReferralInfo(session.sub);
  if (!info) return json(404, { error: "User not found" });

  const res = await supabaseFetch<CommissionRow[]>(
    `/rest/v1/transactions?select=id,amount,created_at,node:nodes(owner:users(name),tier:node_tiers(name))&user_id=eq.${session.sub}&type=eq.referral&order=created_at.desc&limit=100`
  );
  const rows = res.status === 200 ? (res.data ?? []) : [];

  const commissions = rows.map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    created_at: r.created_at,
    referee: r.node?.owner?.name ?? null,
    tier: r.node?.tier?.name ?? null,
  }));
  const commission_earnings = Number(
    commissions.reduce((sum, c) => sum + c.amount, 0).toFixed(2)
  );

  return json(200, { referral: info, commission_earnings, commissions });
}
