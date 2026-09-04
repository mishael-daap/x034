import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { paystackVerify } from "@/lib/paystack";
import { purchaseNode } from "@/lib/nodes";
import { USD_TO_NGN } from "@/lib/constants";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const money = (n: number) => Math.round(n * 100) / 100;

type PaymentRow = {
  id: string;
  user_id: string;
  tier: string;
  amount: number; // NGN major units
  currency: string;
  status: string;
  node: string | null;
};

/**
 * POST /api/nodes/purchase/complete — finish a node purchase after Paystack
 * redirects back. Server-to-server verification only (never trust the callback
 * query alone): status, amount and metadata must all match the `payments` row
 * recorded at initialize.
 *
 * Delivery is idempotent:
 *   1. claim the row (status initialized → success) — the first callback wins
 *   2. credit the buyer `funding` +P (converts the NGN charge back to USD)
 *   3. run the unchanged purchase split (lib/nodes.ts purchaseNode)
 *   4. mark payments.node = the delivered node
 * A duplicate callback sees node set and is a no-op; a retry after a
 * mid-delivery failure (node still null) re-runs cleanly — the funding row
 * this attempt inserted is rolled back on failure so nothing double-credits.
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
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (!reference) return json(400, { error: "reference is required" });

  const payRes = await supabaseFetch<PaymentRow[]>(
    `/rest/v1/payments?select=id,user_id,tier,amount,currency,status,node&reference=eq.${reference}&limit=1`
  );
  const payment = payRes.data?.[0];
  if (!payment) return json(404, { error: "Unknown payment reference" });
  if (payment.user_id !== session.sub) {
    return json(403, { error: "This payment belongs to another account" });
  }

  // ── Verify with Paystack (server-to-server) ────────────────────────────────
  let verified;
  try {
    verified = await paystackVerify(reference);
  } catch (err) {
    return json(502, {
      error: err instanceof Error ? err.message : "Could not verify payment",
    });
  }
  if (verified.status !== "success") {
    return json(400, { error: "Payment was not successful" });
  }
  if (Number(verified.amount) !== Number(payment.amount) * 100) {
    return json(400, { error: "Payment amount does not match" });
  }
  const metaUserId = verified.metadata?.user_id;
  const metaTierId = verified.metadata?.tier_id;
  if (metaUserId !== session.sub || metaTierId !== payment.tier) {
    return json(403, { error: "Payment details do not match this request" });
  }

  // ── Idempotency: already delivered? no-op. Claimed but not delivered? retry. ─
  // Claim = flip an initialized row; only the first callback can win.
  const claimRes = await supabaseFetch<PaymentRow[]>(
    `/rest/v1/payments?select=id,status,node&reference=eq.${reference}&status=eq.initialized`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "success" }),
    }
  );

  const claimed = claimRes.data?.[0];
  if (claimRes.status === 200 && claimed) {
    if (claimed.node) {
      return json(200, { already_processed: true, node: { id: claimed.node } });
    }
    // Claimed by us (or a prior attempt that failed mid-delivery): deliver below.
  } else {
    // No row flipped: either already success or another request claimed it.
    const reRes = await supabaseFetch<PaymentRow[]>(
      `/rest/v1/payments?select=id,status,node&reference=eq.${reference}&limit=1`
    );
    const current = reRes.data?.[0];
    if (current?.node) {
      return json(200, { already_processed: true, node: { id: current.node } });
    }
    return json(409, { error: "Payment is being processed — try again shortly" });
  }

  // ── Deliver: funding credit → purchase split → delivery marker ─────────────
  const fundingAmount = money(Number(payment.amount) / USD_TO_NGN);

  const fundRes = await supabaseFetch<{ id: string }[]>(`/rest/v1/transactions?select=id`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: session.sub,
      type: "funding",
      amount: fundingAmount,
    }),
  });
  if (fundRes.status !== 201 || !fundRes.data?.[0]) {
    return json(502, { error: fundRes.error ?? "Could not credit payment" });
  }
  const fundingId = fundRes.data[0].id;

  const result = await purchaseNode(session.sub, payment.tier);
  if (!result.ok) {
    // Roll back this attempt's funding so a retry re-delivers cleanly.
    await supabaseFetch(`/rest/v1/transactions?id=eq.${fundingId}`, { method: "DELETE" });
    return json(502, { error: result.error.error });
  }

  await supabaseFetch(`/rest/v1/payments?id=eq.${payment.id}`, {
    method: "PATCH",
    body: JSON.stringify({ node: result.data.node.id }),
  });

  return json(200, {
    already_processed: false,
    ...result.data,
    payment: { reference, amount: Number(payment.amount), currency: payment.currency },
  });
}
