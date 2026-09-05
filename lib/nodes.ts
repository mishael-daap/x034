import { supabaseFetch } from "@/lib/supabase";
import { REFERRAL_COMMISSION_SHARE } from "@/lib/constants";

const money = (n: number) => Math.round(n * 100) / 100;

type TierRow = { id: string; code: string; price: number };
type BuyerRow = { id: string; referrer: string | null };
type BalanceRow = { balance: number };

export type PurchaseSuccess = {
  node: { id: string };
  tier_code: string;
  price: number;
  referral_earned: number;
};

export type PurchaseError = { status: number; error: string };

export type PurchaseResult =
  | { ok: true; data: PurchaseSuccess }
  | { ok: false; error: PurchaseError };

/**
 * Buy a node with wallet balance (price P):
 *   buyer `purchase` −P (wallet debit, full price)
 *   referrer `referral` +0.03P — only when the buyer has a referrer
 * The platform keeps the rest of the price implicitly (the buyer's funds came
 * from deposits/earnings already held by the platform). On partial failure the
 * node and any written transactions are rolled back so a retry is safe.
 */
export async function purchaseNode(
  userId: string,
  tierId: string
): Promise<PurchaseResult> {
  const tierRes = await supabaseFetch<TierRow[]>(
    `/rest/v1/node_tiers?select=id,code,price&id=eq.${tierId}&limit=1`
  );
  const tier = tierRes.data?.[0];
  if (!tier) return { ok: false, error: { status: 404, error: "Tier not found" } };
  const price = Number(tier.price);

  // Buyer + referrer (a referral commission is only paid to a real referrer).
  const buyerRes = await supabaseFetch<BuyerRow[]>(
    `/rest/v1/users?select=id,referrer&id=eq.${userId}&limit=1`
  );
  const buyer = buyerRes.data?.[0];
  if (!buyer) return { ok: false, error: { status: 404, error: "User not found" } };

  // Balance gate: the full price must come out of the wallet (no negative balances).
  const balanceRes = await supabaseFetch<BalanceRow[]>(
    `/rest/v1/user_balances?select=balance&user_id=eq.${userId}`
  );
  const balance =
    balanceRes.status === 200 && balanceRes.data?.length
      ? Number(balanceRes.data[0].balance ?? 0)
      : 0;
  if (balance < price) {
    return { ok: false, error: { status: 400, error: "Insufficient balance" } };
  }

  // The node is the anchor of the purchase's paper trail.
  const nodeRes = await supabaseFetch<{ id: string }[]>(`/rest/v1/nodes?select=id`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ owner: userId, tier: tierId }),
  });
  if (nodeRes.status !== 201 || !nodeRes.data?.[0]) {
    return {
      ok: false,
      error: { status: nodeRes.status, error: nodeRes.error ?? "Could not create node" },
    };
  }
  const node = nodeRes.data[0];

  // Split math: referrer keeps 3% of the price; the rest stays with the platform.
  const referral = buyer.referrer ? money(price * REFERRAL_COMMISSION_SHARE) : 0;

  const rows: { user_id: string; type: string; amount: number }[] = [
    { user_id: userId, type: "purchase", amount: -money(price) },
    ...(buyer.referrer && referral > 0
      ? [{ user_id: buyer.referrer as string, type: "referral", amount: referral }]
      : []),
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
      return {
        ok: false,
        error: { status: res.status, error: res.error ?? "Could not record purchase" },
      };
    }
    const created = res.data?.[0]?.id;
    if (created) written.push(created);
  }

  return {
    ok: true,
    data: {
      node,
      tier_code: tier.code,
      price,
      referral_earned: referral,
    },
  };
}
