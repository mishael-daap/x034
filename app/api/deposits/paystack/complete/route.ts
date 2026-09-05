import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { paystackVerify } from "@/lib/paystack";
import { USD_TO_NGN } from "@/lib/constants";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const money = (n: number) => Math.round(n * 100) / 100;

type PaymentRow = {
  id: string;
  user_id: string;
  amount: number; // NGN major units
  status: string;
  created_at: string;
};

/**
 * POST /api/deposits/paystack/complete — credit a wallet top-up after Paystack
 * redirects back. Server-to-server verification only (never trust the query):
 * status, amount and metadata must match the `payments` row from initialize.
 *
 * Delivery is idempotent: the first callback flips the row initialized→success
 * and credits the wallet (`funding` +USD). If that credit fails the row is
 * flipped back so the next callback can retry cleanly. Later callbacks for the
 * same reference are no-ops (Paystack itself never charges twice).
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
    `/rest/v1/payments?select=id,user_id,amount,status,created_at&reference=eq.${reference}&limit=1`
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
  const meta = verified.metadata ?? {};
  if (meta.user_id !== session.sub || meta.kind !== "deposit") {
    return json(403, { error: "Payment details do not match this request" });
  }

  // ── Idempotency: claim the row (only the first callback wins) ──────────────
  const claimRes = await supabaseFetch<PaymentRow[]>(
    `/rest/v1/payments?select=id,status&reference=eq.${reference}&status=eq.initialized`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "success" }),
    }
  );
  const claimed = claimRes.data?.[0];
  if (!(claimRes.status === 200 && claimed)) {
    return json(200, { already_processed: true });
  }

  // ── Credit the wallet (USD = NGN ÷ USD_TO_NGN) ─────────────────────────────
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
    // Release the claim so a retry can re-deliver cleanly.
    await supabaseFetch(`/rest/v1/payments?reference=eq.${reference}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "initialized" }),
    });
    return json(502, { error: fundRes.error ?? "Could not credit deposit — please retry" });
  }

  const balanceRes = await supabaseFetch<{ balance: number }[]>(
    `/rest/v1/user_balances?select=balance&user_id=eq.${session.sub}`
  );
  const balance =
    balanceRes.status === 200 && balanceRes.data?.length
      ? Number(balanceRes.data[0].balance ?? 0)
      : 0;

  return json(200, { already_processed: false, amount: fundingAmount, balance });
}
