import { PAYSTACK_API } from "@/lib/constants";

// Server-only: never exposed to the client. Read from env at request time so a
// missing key fails loudly in dev instead of silently 401-ing from Paystack.
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY ?? "";

function requireSecretKey(): string {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
  return PAYSTACK_SECRET_KEY;
}

export type PaystackInitializeInput = {
  email: string;
  amountKobo: number;
  metadata: Record<string, string>;
  callbackUrl: string;
};

export type PaystackInitializeResult = {
  reference: string;
  authorization_url: string;
};

/**
 * POST /transaction/initialize — create a Paystack charge. Amount is in the
 * currency subunit (kobo); currency is always NGN for node purchases.
 * Throws on failure (client stays on the purchase page with the message).
 */
export async function paystackInitialize(
  input: PaystackInitializeInput
): Promise<PaystackInitializeResult> {
  const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: String(Math.round(input.amountKobo)),
      currency: "NGN",
      metadata: input.metadata,
      callback_url: input.callbackUrl,
    }),
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: { reference?: string; authorization_url?: string };
  } | null;

  if (!res.ok || !body?.status) {
    throw new Error(body?.message ?? `Paystack initialize failed (HTTP ${res.status})`);
  }

  const { reference, authorization_url } = body.data ?? {};
  if (!reference || !authorization_url) {
    throw new Error("Paystack initialize returned no reference or authorization_url");
  }

  return { reference, authorization_url };
}

export type PaystackVerifiedTransaction = {
  status: string;
  amount: number; // kobo, as returned by Paystack
  currency: string;
  reference: string;
  metadata: Record<string, unknown> | null;
};

/**
 * GET /transaction/verify/:reference — server-to-server verification. Throws
 * on transport/API failure or a non-success Paystack response; the caller
 * decides whether data.status === "success" and the amount matches.
 */
export async function paystackVerify(
  reference: string
): Promise<PaystackVerifiedTransaction> {
  const res = await fetch(
    `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${requireSecretKey()}` },
      cache: "no-store",
    }
  );

  const body = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: Partial<PaystackVerifiedTransaction>;
  } | null;

  if (!res.ok || !body?.status || !body.data) {
    throw new Error(body?.message ?? `Paystack verify failed (HTTP ${res.status})`);
  }

  return body.data as PaystackVerifiedTransaction;
}
