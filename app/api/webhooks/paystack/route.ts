import { NextResponse } from "next/server";
import { verifyPaystackSignature } from "@/lib/paystack";
import { settlePayout } from "@/lib/payouts";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type PaystackEvent = {
  event?: string;
  data?: { reference?: string };
};

/**
 * POST /api/webhooks/paystack — Paystack's final word on a transfer.
 *
 * Authenticity is HMAC-SHA512 of the RAW body (read with req.text(), never
 * req.json()) compared timing-safe against x-paystack-signature. Settlement is
 * idempotent, so redelivered events are safe. Always 200 after a valid
 * signature — Paystack retries non-2xx responses for up to 72 hours.
 *
 * Note: webhooks cannot reach localhost. Locally, use the admin "Check status"
 * button (POST /api/payouts/[id]/verify) instead.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(raw, signature)) {
    return json(401, { error: "Invalid signature" });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(raw) as PaystackEvent;
  } catch {
    return json(400, { error: "Invalid payload" });
  }

  const reference = event.data?.reference;
  if (
    typeof event.event === "string" &&
    event.event.startsWith("transfer.") &&
    typeof reference === "string"
  ) {
    // Wait for settlement so a redelivery cannot race the first attempt;
    // any failure is logged by the caller's runtime and retried by Paystack.
    await settlePayout(reference).catch(() => null);
  }

  return json(200, { received: true });
}
