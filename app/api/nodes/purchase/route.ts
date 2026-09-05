import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { purchaseNode } from "@/lib/nodes";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type Tier = {
  id: string;
  code: string;
  name: string;
  vcpu: number;
  ram_gb: number;
  gpu: number;
  bandwidth: number;
  price: number;
};

/** GET /api/nodes/purchase — list purchasable node options. */
export async function GET() {
  const res = await supabaseFetch<Tier[]>(
    `/rest/v1/node_tiers?select=id,code,name,vcpu,ram_gb,gpu,bandwidth,price&order=price`
  );
  if (res.status !== 200) return json(res.status, { error: res.error });
  return json(200, { tiers: res.data ?? [] });
}

/**
 * POST /api/nodes/purchase — buy a node with wallet balance.
 * The full price is debited from the buyer's wallet; referrers earn 3%.
 * When the wallet can't cover the price, respond 400 with code
 * INSUFFICIENT_FUNDS (plus balance/price) so the UI can prompt a deposit.
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
  const tierId = typeof body.tierId === "string" ? body.tierId.trim() : "";
  if (!tierId) return json(400, { error: "tierId is required" });

  // Wallet-funded purchase: check affordability up front so the client can
  // prompt a deposit with the exact shortfall.
  const tierRes = await supabaseFetch<Tier[]>(
    `/rest/v1/node_tiers?select=id,price&id=eq.${tierId}&limit=1`
  );
  const tier = tierRes.data?.[0];
  if (!tier) return json(404, { error: "Node option not found" });
  const price = Number(tier.price);

  const balanceRes = await supabaseFetch<{ balance: number }[]>(
    `/rest/v1/user_balances?select=balance&user_id=eq.${session.sub}`
  );
  const balance =
    balanceRes.status === 200 && balanceRes.data?.length
      ? Number(balanceRes.data[0].balance ?? 0)
      : 0;

  if (balance < price) {
    return json(400, {
      error: "Insufficient balance",
      code: "INSUFFICIENT_FUNDS",
      balance,
      price,
    });
  }

  const result = await purchaseNode(session.sub, tierId);
  if (!result.ok) {
    return json(result.error.status, { error: result.error.error });
  }

  return json(200, result.data);
}
