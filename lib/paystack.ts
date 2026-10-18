import crypto from "node:crypto";
import { PAYSTACK_API } from "@/lib/constants";

// Server-only: never exposed to the client. Read from env at request time so a
// missing key fails loudly in dev instead of silently 401-ing from Paystack.
//
// Mode is chosen by PAYSTACK_MODE ("test" | "live"). Each mode has its own key
// (`PAYSTACK_SECRET_KEY_TEST` / `PAYSTACK_SECRET_KEY_LIVE`); the legacy single
// `PAYSTACK_SECRET_KEY` still works as a fallback. A live key is never used in
// test mode and vice versa — a mismatch fails loudly rather than moving money
// against the wrong environment.

export type PaystackMode = "test" | "live";

export function paystackMode(): PaystackMode {
  const forced = (process.env.PAYSTACK_MODE ?? "").trim().toLowerCase();
  if (forced === "live" || forced === "test") return forced;
  const candidate =
    process.env.PAYSTACK_SECRET_KEY_LIVE || process.env.PAYSTACK_SECRET_KEY || "";
  return candidate.startsWith("sk_live_") ? "live" : "test";
}

export function isTestMode(): boolean {
  return paystackMode() === "test";
}

function requireSecretKey(): string {
  const mode = paystackMode();
  const key =
    (mode === "live"
      ? process.env.PAYSTACK_SECRET_KEY_LIVE
      : process.env.PAYSTACK_SECRET_KEY_TEST) ||
    process.env.PAYSTACK_SECRET_KEY ||
    "";

  if (!key) {
    throw new Error(
      mode === "live"
        ? "PAYSTACK_SECRET_KEY_LIVE is not configured (PAYSTACK_MODE=live)"
        : "PAYSTACK_SECRET_KEY_TEST is not configured"
    );
  }
  if (mode === "live" && !key.startsWith("sk_live_")) {
    throw new Error("PAYSTACK_MODE=live but the configured secret key is not a live key");
  }
  if (mode === "test" && key.startsWith("sk_live_")) {
    throw new Error("PAYSTACK_MODE=test but the configured secret key is a live key");
  }
  return key;
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
// Banks — the catalogue transfers are paid into
// ---------------------------------------------------------------------------

export type PaystackBank = {
  name: string;
  code: string;
  currency: string;
  type: string;
  supports_transfer: boolean;
  active: boolean;
  is_deleted: boolean;
};

/**
 * GET /bank — the full Nigerian NGN catalogue (289 entries, one page). The
 * caller filters to transfer-capable banks (lib/banks.ts). Throws on failure.
 */
export async function paystackListBanks(): Promise<PaystackBank[]> {
  const res = await fetch(
    `${PAYSTACK_API}/bank?country=nigeria&currency=NGN`,
    {
      headers: { Authorization: `Bearer ${requireSecretKey()}` },
      cache: "no-store",
    }
  );

  const body = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: PaystackBank[];
  } | null;

  if (!res.ok || !body?.status || !Array.isArray(body.data)) {
    throw new Error(body?.message ?? `Paystack bank list failed (HTTP ${res.status})`);
  }
  return body.data;
}

// ---------------------------------------------------------------------------
// Payouts — transfers to a user's bank account
// ---------------------------------------------------------------------------

/** Paystack said no (as opposed to being unreachable). Quota errors show up
 *  here with status 429 / 400 and a "daily limit" message — callers decide
 *  whether that is blocking (see lib/payouts.ts). */
export class PaystackApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "PaystackApiError";
    this.status = status;
    this.code = code;
  }
}

type PaystackEnvelope<T> = {
  status?: boolean;
  message?: string;
  code?: string;
  data?: T;
};

async function paystackRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${PAYSTACK_API}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${requireSecretKey()}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as PaystackEnvelope<T> | null;
  if (!res.ok || !body?.status) {
    throw new PaystackApiError(
      body?.message ?? `Paystack request failed (HTTP ${res.status})`,
      res.status,
      body?.code ?? null
    );
  }
  return body.data as T;
}

export type PaystackResolvedAccount = {
  account_number: string;
  account_name: string;
};

/**
 * GET /bank/resolve — who owns this account? The name is authoritative and is
 * what gets stored on the profile and printed on the payout.
 */
export async function paystackResolveAccount(input: {
  accountNumber: string;
  bankCode: string;
}): Promise<PaystackResolvedAccount> {
  const data = await paystackRequest<PaystackResolvedAccount>(
    `/bank/resolve?account_number=${encodeURIComponent(input.accountNumber)}&bank_code=${encodeURIComponent(input.bankCode)}`
  );
  if (!data?.account_name) {
    throw new PaystackApiError("Account could not be resolved", 422);
  }
  return data;
}

export type PaystackRecipient = {
  recipient_code: string;
  details?: { account_name?: string };
};

/** POST /transferrecipient — created once per destination and reused. */
export async function paystackCreateRecipient(input: {
  name: string;
  accountNumber: string;
  bankCode: string;
}): Promise<PaystackRecipient> {
  return paystackRequest<PaystackRecipient>("/transferrecipient", {
    method: "POST",
    body: {
      type: "nuban",
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: "NGN",
    },
  });
}

export type PaystackTransfer = {
  reference: string;
  status: string; // "success" (queued) | "pending" | "otp"
  transfer_code: string;
  amount: number;
};

/**
 * POST /transfer — amount in kobo. A success response only means *queued*;
 * the final state arrives by webhook or GET /transfer/verify.
 */
export async function paystackInitiateTransfer(input: {
  amountKobo: number;
  recipient: string;
  reference: string;
  reason?: string;
}): Promise<PaystackTransfer> {
  return paystackRequest<PaystackTransfer>("/transfer", {
    method: "POST",
    body: {
      source: "balance",
      amount: Math.round(input.amountKobo),
      recipient: input.recipient,
      reference: input.reference,
      reason: input.reason ?? "Zephyra payout",
    },
  });
}

export type PaystackTransferVerification = {
  reference: string;
  status: string; // success | pending | otp | failed | reversed
  amount: number;
  fee_charged?: number;
  transfer_code?: string;
  failures?: unknown;
};

/** GET /transfer/verify/:reference — the manual confirmation path. */
export async function paystackVerifyTransfer(
  reference: string
): Promise<PaystackTransferVerification> {
  return paystackRequest<PaystackTransferVerification>(
    `/transfer/verify/${encodeURIComponent(reference)}`
  );
}

/** POST /transfer/finalize_transfer — only when OTP confirmation is enabled. */
export async function paystackFinalizeTransfer(input: {
  transferCode: string;
  otp: string;
}): Promise<{ status: string; transfer_code: string }> {
  return paystackRequest<{ status: string; transfer_code: string }>(
    "/transfer/finalize_transfer",
    { method: "POST", body: { transfer_code: input.transferCode, otp: input.otp } }
  );
}

export type PaystackBalance = { currency: string; balance: number };

/** GET /balance — kobo per currency. The platform's NGN float must cover a
 *  payout before it is initiated. */
export async function paystackGetBalance(): Promise<PaystackBalance[]> {
  const data = await paystackRequest<PaystackBalance[]>("/balance");
  return Array.isArray(data) ? data : [];
}

/**
 * Webhook authenticity: HMAC-SHA512 of the raw request body with the secret
 * key, compared timing-safe against `x-paystack-signature`.
 */
export function verifyPaystackSignature(
  rawBody: string,
  signature: string | null
): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha512", requireSecretKey())
    .update(rawBody, "utf8")
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
