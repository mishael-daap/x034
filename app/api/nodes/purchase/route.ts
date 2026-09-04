import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { paystackInitialize } from "@/lib/paystack";
import { USD_TO_NGN } from "@/lib/constants";

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

type BuyerRow = { id: string; email: string | null };

/** GET /api/nodes/purchase — list purchasable tiers. */
export async function GET() {
  const res = await supabaseFetch<Tier[]>(
    `/rest/v1/node_tiers?select=id,code,name,vcpu,ram_gb,gpu,bandwidth,price&order=price`
  );
  if (res.status !== 200) return json(res.status, { error: res.error });
  return json(200, { tiers: res.data ?? [] });
}

/**
 * POST /api/nodes/purchase — initialize a Paystack payment for a node tier.
 * The price is USD; Paystack charges NGN at the fixed sandbox rate
 * (USD_TO_NGN), amount in kobo = round(price × USD_TO_NGN × 100).
 * A `payments` row (status 'initialized', unique reference) is recorded so the
 * callback can verify exactly what was charged; the node itself is only
 * created after server-side verification (see /api/nodes/purchase/complete).
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

  const tierRes = await supabaseFetch<Tier[]>(
    `/rest/v1/node_tiers?select=id,code,name,vcpu,ram_gb,gpu,bandwidth,price&id=eq.${tierId}&limit=1`
  );
  const tier = tierRes.data?.[0];
  if (!tier) return json(404, { error: "Tier not found" });
  const price = Number(tier.price);

  // Paystack requires a customer email; signup now collects both email + phone,
  // but legacy phone-only accounts still need a clear error here.
  const buyerRes = await supabaseFetch<BuyerRow[]>(
    `/rest/v1/users?select=id,email&id=eq.${session.sub}&limit=1`
  );
  const buyer = buyerRes.data?.[0];
  if (!buyer) return json(404, { error: "User not found" });
  if (!buyer.email) {
    return json(400, {
      error: "Your account has no email — required for card payments. Contact support to add one.",
    });
  }

  const amountKobo = Math.round(price * USD_TO_NGN * 100);
  const callbackUrl = `${new URL(req.url).origin}/nodes/purchase/complete`;

  let initialized;
  try {
    initialized = await paystackInitialize({
      email: buyer.email,
      amountKobo,
      metadata: { user_id: session.sub, tier_id: tierId },
      callbackUrl,
    });
  } catch (err) {
    return json(502, {
      error: err instanceof Error ? err.message : "Could not contact Paystack",
    });
  }

  // Record the charge intent (amount stored in NGN major units).
  const payRes = await supabaseFetch(`/rest/v1/payments`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: session.sub,
      tier: tierId,
      reference: initialized.reference,
      amount: amountKobo / 100,
      currency: "NGN",
      status: "initialized",
    }),
  });
  if (payRes.status !== 201) {
    return json(500, { error: payRes.error ?? "Could not record payment" });
  }

  return json(200, {
    authorization_url: initialized.authorization_url,
    reference: initialized.reference,
    amount_kobo: amountKobo,
  });
}
