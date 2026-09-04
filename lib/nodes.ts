import { supabaseFetch } from "@/lib/supabase";
import {
  NODE_SALE_SHARE,
  PLATFORM_CUT_SHARE,
  PLATFORM_USER_ID,
  REFERRAL_COMMISSION_SHARE,
} from "@/lib/constants";

const money = (n: number) => Math.round(n * 100) / 100;

type TierRow = { id: string; code: string; price: number };
type BuyerRow = { id: string; referrer: string | null };
type BalanceRow = { balance: number };

export type PurchaseSuccess = {
  node: { id: string };
  tier_code: string;
  price: number;
  splits: { referral: number; platform_earnings: number; node_sale: number };
};

export type PurchaseError = { status: number; error: string };

export type PurchaseResult =
  | { ok: true; data: PurchaseSuccess }
  | { ok: false; error: PurchaseError };

/**
 * Create a node for the buyer and write the full reconciling purchase split
 * (price P): buyer `purchase` −P; platform `node_sale` +0.5P and
 * `platform_earnings` +0.2P (+0.5P when the buyer has no referrer); referrer
 * `referral` +0.3P (only when the buyer has a referrer). Every row carries
 * `node` = the new node's id. On partial failure the node and any written
 * transactions are rolled back so a retry is safe.
 *
 * The balance gate stays here as an invariant (no negative balances): the
 * caller must have funded the buyer first (verified Paystack payment credits a
 * `funding` row, which makes the gate pass).
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

  // Balance gate: purchases must be funded.
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

  // Split math (rounded to 2dp).
  const nodeSale = money(price * NODE_SALE_SHARE);
  const noReferrer = !buyer.referrer;
  const platformCut = noReferrer
    ? money(price * (PLATFORM_CUT_SHARE + REFERRAL_COMMISSION_SHARE))
    : money(price * PLATFORM_CUT_SHARE);
  const referral = noReferrer ? 0 : money(price * REFERRAL_COMMISSION_SHARE);

  const rows: { user_id: string; type: string; amount: number }[] = [
    { user_id: userId, type: "purchase", amount: -money(price) },
    { user_id: PLATFORM_USER_ID, type: "node_sale", amount: nodeSale },
    { user_id: PLATFORM_USER_ID, type: "platform_earnings", amount: platformCut },
    ...(noReferrer
      ? []
      : [{ user_id: buyer.referrer as string, type: "referral", amount: referral }]),
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
      splits: { referral, platform_earnings: platformCut, node_sale: nodeSale },
    },
  };
}
