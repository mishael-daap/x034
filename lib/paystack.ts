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

// ---------------------------------------------------------------------------
// Payouts — transfers to a user's bank account (Paystack Transfers API)
// ---------------------------------------------------------------------------

/** Map the seeded banks to Paystack NUBAN bank codes. */
export const BANK_CODE_BY_NAME: Record<string, string> = {
  "First Bank": "011",
  "Zenith Bank": "057",
  GTBank: "058",
  "Access Bank": "044",
};

export function resolveBankCode(bankName: string | null | undefined): string | null {
  if (!bankName) return null;
  return BANK_CODE_BY_NAME[bankName] ?? null;
}

export type PaystackRecipientInput = {
  name: string;
  accountNumber: string;
  bankCode: string;
};

export type PaystackRecipientResult = { recipient_code: string };

/**
 * POST /transferrecipient — create a NUBAN transfer recipient for a user's
 * saved bank + account number. Throws on failure.
 */
export async function paystackCreateRecipient(
  input: PaystackRecipientInput
): Promise<PaystackRecipientResult> {
  const res = await fetch(`${PAYSTACK_API}/transferrecipient`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: "NGN",
    }),
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: PaystackRecipientResult;
  } | null;

  if (!res.ok || !body?.status || !body.data?.recipient_code) {
    throw new Error(body?.message ?? `Paystack recipient failed (HTTP ${res.status})`);
  }
  return { recipient_code: body.data.recipient_code };
}

export type PaystackTransferInput = {
  amountKobo: number;
  recipient: string; // recipient_code
  reference: string;
  reason?: string;
};

export type PaystackTransferResult = {
  reference: string;
  status: string;
  amount: number;
  recipient_code: string;
};

/**
 * POST /transfer — initiate a payout from the Paystack balance. Amount is in
 * kobo. Retry with the same reference is safe (Paystack treats it as one
 * transfer), which is why the caller always sends a fresh uuid reference.
 * Throws on failure.
 */
export async function paystackInitiateTransfer(
  input: PaystackTransferInput
): Promise<PaystackTransferResult> {
  const res = await fetch(`${PAYSTACK_API}/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "balance",
      amount: String(Math.round(input.amountKobo)),
      reference: input.reference,
      recipient: input.recipient,
      reason: input.reason ?? "Zephyra payout",
    }),
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: {
      reference?: string;
      status?: string;
      amount?: number;
      recipient?: { recipient_code?: string };
    };
  } | null;

  if (!res.ok || !body?.status || !body.data?.reference) {
    throw new Error(body?.message ?? `Paystack transfer failed (HTTP ${res.status})`);
  }
  return {
    reference: body.data.reference ?? input.reference,
    status: body.data.status ?? "pending",
    amount: Number(body.data.amount ?? 0),
    recipient_code: body.data.recipient?.recipient_code ?? input.recipient,
  };
}
