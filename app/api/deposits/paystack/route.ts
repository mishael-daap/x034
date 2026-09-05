import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { paystackInitialize } from "@/lib/paystack";
import { USD_TO_NGN } from "@/lib/constants";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const money = (n: number) => Math.round(n * 100) / 100;

type BuyerRow = { id: string; email: string | null };
type TierRow = { id: string };

/**
 * POST /api/deposits/paystack — initialize a Paystack top-up.
 * Amount is USD (as displayed); Paystack charges NGN at USD_TO_NGN.
 * The charge is recorded in `payments` (status initialized, unique reference)
 * so the callback can verify and credit exactly what was paid.
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

  const parsed = Number(body.amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return json(400, { error: "Enter a deposit amount greater than zero" });
  }
  const amountUsd = money(parsed);
  if (amountUsd <= 0) return json(400, { error: "Enter a deposit amount greater than zero" });

  // Paystack requires a customer email.
  const buyerRes = await supabaseFetch<BuyerRow[]>(
    `/rest/v1/users?select=id,email&id=eq.${session.sub}&limit=1`
  );
  const buyer = buyerRes.data?.[0];
  if (!buyer) return json(404, { error: "User not found" });
  if (!buyer.email) {
    return json(400, {
      error: "Your account has no email — required for card payments. Add one on your profile.",
    });
  }

  // `payments.tier` must point at a node_tier row. Deposits don't buy a node,
  // so anchor the charge on the first (cheapest) tier — deposits never read it.
  const tierRes = await supabaseFetch<TierRow[]>(
    `/rest/v1/node_tiers?select=id&order=price&limit=1`
  );
  const anchorTier = tierRes.data?.[0];
  if (!anchorTier) return json(500, { error: "No node options configured" });

  const amountNgn = money(amountUsd * USD_TO_NGN);
  const amountKobo = Math.round(amountUsd * USD_TO_NGN * 100);
  const callbackUrl = `${new URL(req.url).origin}/deposit/complete`;

  let initialized;
  try {
    initialized = await paystackInitialize({
      email: buyer.email,
      amountKobo,
      metadata: { user_id: session.sub, kind: "deposit", amount_usd: String(amountUsd) },
      callbackUrl,
    });
  } catch (err) {
    return json(502, {
      error: err instanceof Error ? err.message : "Could not contact Paystack",
    });
  }

  const payRes = await supabaseFetch(`/rest/v1/payments`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: session.sub,
      tier: anchorTier.id,
      reference: initialized.reference,
      amount: amountNgn,
      currency: "NGN",
      status: "initialized",
    }),
  });
  if (payRes.status !== 201) {
    return json(500, { error: payRes.error ?? "Could not record deposit" });
  }

  return json(200, {
    authorization_url: initialized.authorization_url,
    reference: initialized.reference,
    amount_usd: amountUsd,
  });
}
