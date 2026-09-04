import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import {
  NODE_SALE_SHARE,
  PLATFORM_CUT_SHARE,
  PLATFORM_USER_ID,
  REFERRAL_COMMISSION_SHARE,
} from "@/lib/constants";

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

type BuyerRow = { id: string; referrer: string | null };

type BalanceRow = { balance: number };

const money = (n: number) => Math.round(n * 100) / 100;

/** GET /api/nodes/purchase — list purchasable tiers. */
export async function GET() {
  const res = await supabaseFetch<Tier[]>(
    `/rest/v1/node_tiers?select=id,code,name,vcpu,ram_gb,gpu,bandwidth,price&order=price`
  );
  if (res.status !== 200) return json(res.status, { error: res.error });
  return json(200, { tiers: res.data ?? [] });
}

/**
 * POST /api/nodes/purchase — buy a node of the given tier (price P).
 * Requires an available balance ≥ P (no negative balances; funding comes from
 * payment processing, an upcoming feature). Writes the full reconciling split,
 * each row pointing at the new node:
 *   buyer `purchase` −P
 *   platform `node_sale` +0.5P
 *   platform `platform_earnings` +0.2P (+0.5P when the buyer has no referrer)
 *   referrer `referral` +0.3P (only when the buyer has a referrer)
 * On partial failure the node and any written transactions are rolled back so
 * a retry is safe.
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

  const tierRes = await supabaseFetch<{ id: string; code: string; price: number }[]>(
    `/rest/v1/node_tiers?select=id,code,price&id=eq.${tierId}&limit=1`
  );
  const tier = tierRes.data?.[0];
  if (!tier) return json(404, { error: "Tier not found" });
  const price = Number(tier.price);

  // Buyer + referrer (a referral commission is only paid to a real referrer).
  const buyerRes = await supabaseFetch<BuyerRow[]>(
    `/rest/v1/users?select=id,referrer&id=eq.${session.sub}&limit=1`
  );
  const buyer = buyerRes.data?.[0];
  if (!buyer) return json(404, { error: "User not found" });

  // Balance gate: purchases must be funded.
  const balanceRes = await supabaseFetch<BalanceRow[]>(
    `/rest/v1/user_balances?select=balance&user_id=eq.${session.sub}`
  );
  const balance =
    balanceRes.status === 200 && balanceRes.data?.length
      ? Number(balanceRes.data[0].balance ?? 0)
      : 0;
  if (balance < price) {
    return json(400, { error: "Insufficient balance" });
  }

  // The node is the anchor of the purchase's paper trail.
  const nodeRes = await supabaseFetch<{ id: string }[]>(`/rest/v1/nodes?select=id`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ owner: session.sub, tier: tierId }),
  });
  if (nodeRes.status !== 201 || !nodeRes.data?.[0]) {
    return json(nodeRes.status, { error: nodeRes.error ?? "Could not create node" });
  }
  const node = nodeRes.data[0];

  // Split math (rounded to 2dp).
  const nodeSale = money(price * NODE_SALE_SHARE);
  const noReferrer = !buyer.referrer;
  const platformCut = noReferrer
    ? money(price * (PLATFORM_CUT_SHARE + REFERRAL_COMMISSION_SHARE))
    : money(price * PLATFORM_CUT_SHARE);
  const referral = noReferrer ? 0 : money(price * REFERRAL_COMMISSION_SHARE);

  const rows: { user_id: string; type: string; amount: number }[] = [
    { user_id: session.sub, type: "purchase", amount: -money(price) },
    { user_id: PLATFORM_USER_ID, type: "node_sale", amount: nodeSale },
    { user_id: PLATFORM_USER_ID, type: "platform_earnings", amount: platformCut },
    ...(noReferrer ? [] : [{ user_id: buyer.referrer as string, type: "referral", amount: referral }]),
  ];

  // Write rows; roll back everything on partial failure (retry-safe).
  const written: string[] = [];
  for (const row of rows) {
    const res = await supabaseFetch<{ id: string }[]>(`/rest/v1/transactions?select=id`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...row, node: node.id }),
    });
    if (res.status !== 201) {
      for (const id of written) {
        await supabaseFetch(`/rest/v1/transactions?id=eq.${id}`, { method: "DELETE" });
      }
      await supabaseFetch(`/rest/v1/nodes?id=eq.${node.id}`, { method: "DELETE" });
      return json(res.status, { error: res.error ?? "Could not record purchase" });
    }
    const created = res.data?.[0]?.id;
    if (created) written.push(created);
  }

  return json(201, {
    node,
    tier_code: tier.code,
    price,
    splits: { referral, platform_earnings: platformCut, node_sale: nodeSale },
  });
}
