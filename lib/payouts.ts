import { randomUUID } from "node:crypto";
import { isTestMode } from "@/lib/banks";
import { supabaseFetch } from "@/lib/supabase";
import {
  PLATFORM_USER_ID,
  USD_TO_NGN,
  WITHDRAWAL_COMMISSION_SHARE,
  WITHDRAWAL_PAYOUT_SHARE,
} from "@/lib/constants";
import {
  PaystackApiError,
  paystackCreateRecipient,
  paystackGetBalance,
  paystackInitiateTransfer,
  paystackResolveAccount,
  paystackVerifyTransfer,
} from "@/lib/paystack";

// Payout engine (roadmap 6). Owns everything that moves real money:
// approval → recipient → persisted payout → debit → transfer → settlement.
// Every outcome is idempotent; nothing here trusts a "queued" response as paid.

const money = (n: number) => Math.round(n * 100) / 100;

/** Uniform result shape so routes can map straight to a JSON response. */
export type PayoutResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

type BankRef = { id: string; name: string; code: string | null };

export type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  reason: string | null;
  bank: BankRef | null;
  account_number: string | null;
  account_name: string | null;
  user: { name: string; email: string | null } | null;
};

export type PayoutRecord = {
  id: string;
  withdrawal_id: string;
  user_id: string;
  reference: string;
  recipient_code: string | null;
  transfer_code: string | null;
  amount_usd: number;
  amount_kobo: number;
  rate: number;
  currency: string;
  status: string;
  fee_charged: number | null;
  failure_reason: string | null;
  attempt: number;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
};

const TERMINAL = ["success", "failed", "reversed"];

const WITHDRAWAL_SELECT = `id,user_id,amount,status,reason,account_number,account_name,bank:banks(id,name,code),user:users!withdrawals_user_id_fkey(name,email)`;

// ---------------------------------------------------------------------------
// Reads / small writes
// ---------------------------------------------------------------------------

async function fetchWithdrawal(id: string): Promise<WithdrawalRow | null> {
  const res = await supabaseFetch<WithdrawalRow[]>(
    `/rest/v1/withdrawals?select=${WITHDRAWAL_SELECT}&id=eq.${id}&limit=1`
  );
  return res.status === 200 ? (res.data?.[0] ?? null) : null;
}

async function fetchBalance(userId: string): Promise<number> {
  const res = await supabaseFetch<{ balance: number }[]>(
    `/rest/v1/user_balances?select=balance&user_id=eq.${userId}`
  );
  return res.status === 200 && res.data?.length ? Number(res.data[0].balance ?? 0) : 0;
}

async function fetchLatestPayout(withdrawalId: string): Promise<PayoutRecord | null> {
  const res = await supabaseFetch<PayoutRecord[]>(
    `/rest/v1/payouts?select=*&withdrawal_id=eq.${withdrawalId}&order=created_at.desc&limit=1`
  );
  return res.status === 200 ? (res.data?.[0] ?? null) : null;
}

export async function fetchPayout(id: string): Promise<PayoutRecord | null> {
  const res = await supabaseFetch<PayoutRecord[]>(
    `/rest/v1/payouts?select=*&id=eq.${id}&limit=1`
  );
  return res.status === 200 ? (res.data?.[0] ?? null) : null;
}

async function insertLedger(row: {
  user_id: string;
  type: string;
  amount: number;
  status?: string;
}): Promise<string | null> {
  const res = await supabaseFetch<{ id: string }[]>(`/rest/v1/transactions?select=id`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return res.status === 201 ? (res.data?.[0]?.id ?? null) : null;
}

/** Conditional withdrawal patch; returns null when the filter matched no row. */
async function patchWithdrawal(
  id: string,
  fields: Record<string, unknown>,
  extraFilter = ""
): Promise<{ id: string; amount: number; status: string; reason: string | null } | null> {
  const res = await supabaseFetch<
    { id: string; amount: number; status: string; reason: string | null }[]
  >(`/rest/v1/withdrawals?select=id,amount,status,reason&id=eq.${id}${extraFilter}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(fields),
  });
  return res.data?.[0] ?? null;
}

async function patchPayout(
  id: string,
  fields: Record<string, unknown>,
  extraFilter = ""
): Promise<PayoutRecord | null> {
  const res = await supabaseFetch<PayoutRecord[]>(
    `/rest/v1/payouts?select=*&id=eq.${id}${extraFilter}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
    }
  );
  return res.data?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Destination helpers
// ---------------------------------------------------------------------------

/** Reuse the Paystack recipient for a destination instead of re-creating it. */
export async function getOrCreateRecipient(input: {
  userId: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
}): Promise<string> {
  const existing = await supabaseFetch<{ recipient_code: string }[]>(
    `/rest/v1/transfer_recipients?select=recipient_code&user_id=eq.${input.userId}&bank_code=eq.${encodeURIComponent(input.bankCode)}&account_number=eq.${encodeURIComponent(input.accountNumber)}&limit=1`
  );
  const found = existing.data?.[0]?.recipient_code;
  if (found) return found;

  const created = await paystackCreateRecipient({
    name: input.accountName.slice(0, 200),
    accountNumber: input.accountNumber,
    bankCode: input.bankCode,
  });

  await supabaseFetch(`/rest/v1/transfer_recipients?on_conflict=user_id,bank_code,account_number`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: input.userId,
      bank_code: input.bankCode,
      account_number: input.accountNumber,
      recipient_code: created.recipient_code,
      account_name: input.accountName,
    }),
  });

  return created.recipient_code;
}

const normalizeName = (v: string) => v.trim().replace(/\s+/g, " ").toUpperCase();

/** Quota / reachability failures must not block a payout that was already verified. */
function isSoftResolveFailure(err: unknown): boolean {
  if (!(err instanceof PaystackApiError)) return true; // network/transport
  return err.status === 429 || /daily limit|rate limit|too many/i.test(err.message);
}

/** Verify a reference without throwing — null when Paystack doesn't know it. */
async function verifyQuietly(reference: string) {
  try {
    return await paystackVerifyTransfer(reference);
  } catch (err) {
    if (err instanceof PaystackApiError && (err.status === 404 || err.code === "not_found")) {
      return null;
    }
    throw err;
  }
}

/** The platform's NGN float must cover the transfer before it is initiated. */
async function hasFloat(amountKobo: number): Promise<boolean | null> {
  try {
    const balances = await paystackGetBalance();
    const ngn = balances.find((b) => b.currency === "NGN");
    return Number(ngn?.balance ?? 0) >= amountKobo;
  } catch {
    return null; // balance endpoint unavailable — let the transfer decide
  }
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

export type ApprovalOutcome = {
  /** True when the approval path auto-declined (balance no longer covered). */
  declined?: boolean;
  withdrawal: { id: string; amount: number; status: string; reason: string | null };
  payout?: PayoutRecord;
  payoutUsd?: number;
  commission?: number;
};

/**
 * Approve a pending withdrawal and fire the transfer.
 *
 * Debit happens here (not on confirmation) so the funds cannot be spent while
 * the transfer is in flight. Every later outcome — success, failure, reversal
 * — is settled idempotently by settlePayout().
 */
export async function approveWithdrawal(
  withdrawalId: string,
  adminId: string
): Promise<PayoutResult<ApprovalOutcome>> {
  const withdrawal = await fetchWithdrawal(withdrawalId);
  if (!withdrawal) return { ok: false, status: 404, error: "Withdrawal not found" };
  if (withdrawal.status !== "pending") {
    return { ok: false, status: 409, error: "Withdrawal already decided" };
  }

  const amount = money(Number(withdrawal.amount));

  const balance = await fetchBalance(withdrawal.user_id);
  if (balance < amount) {
    const declined = await declineWithdrawal(withdrawalId, adminId, "Insufficient balance");
    if (!declined.ok) return declined;
    return { ok: true, data: { declined: true, withdrawal: declined.data } };
  }

  if (!withdrawal.bank?.code || !withdrawal.account_number || !withdrawal.account_name) {
    return {
      ok: false,
      status: 400,
      error: "The requester has no verified payout account",
    };
  }

  // Re-verify the destination. An explicit name mismatch blocks the payout;
  // a quota/transport failure falls back to the stored verified name. Sandbox
  // names are synthesized (no real accounts, 3 resolves/day), so it is skipped.
  if (!isTestMode()) {
    try {
      const resolved = await paystackResolveAccount({
        accountNumber: withdrawal.account_number,
        bankCode: withdrawal.bank.code,
      });
      if (normalizeName(resolved.account_name) !== normalizeName(withdrawal.account_name)) {
        return {
          ok: false,
          status: 409,
          error: `The account name no longer matches (Paystack: ${resolved.account_name}). Ask the user to re-verify their bank details.`,
        };
      }
    } catch (err) {
      if (!isSoftResolveFailure(err)) {
        const message = err instanceof Error ? err.message : "Could not re-verify the account";
        return { ok: false, status: 409, error: `Could not re-verify the account — ${message}` };
      }
    }
  }

  const payoutUsd = money(amount * WITHDRAWAL_PAYOUT_SHARE);
  const amountKobo = Math.round(payoutUsd * USD_TO_NGN * 100);
  if (!(amountKobo > 0)) {
    return { ok: false, status: 400, error: "Payout amount is too small to transfer" };
  }

  const float = await hasFloat(amountKobo);
  if (float === false) {
    return {
      ok: false,
      status: 409,
      error: "The platform's Paystack balance is too low for this payout right now. Nothing was charged.",
    };
  }

  let recipientCode: string;
  try {
    recipientCode = await getOrCreateRecipient({
      userId: withdrawal.user_id,
      bankCode: withdrawal.bank.code,
      accountNumber: withdrawal.account_number,
      accountName: withdrawal.account_name,
    });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "Could not create the transfer recipient",
    };
  }

  const previous = await fetchLatestPayout(withdrawalId);
  const attempt = (previous?.attempt ?? 0) + 1;
  const reference = `payout_${randomUUID()}`;

  // Persist the attempt BEFORE calling Paystack: a timeout must never leave an
  // untracked transfer.
  const createdRes = await supabaseFetch<PayoutRecord[]>(
    `/rest/v1/payouts?select=*`,
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        withdrawal_id: withdrawalId,
        user_id: withdrawal.user_id,
        reference,
        recipient_code: recipientCode,
        amount_usd: payoutUsd,
        amount_kobo: amountKobo,
        rate: USD_TO_NGN,
        currency: "NGN",
        status: "initialized",
        attempt,
      }),
    }
  );
  const payout = createdRes.data?.[0];
  if (createdRes.status !== 201 || !payout) {
    return { ok: false, status: 502, error: "Could not record the payout — nothing was charged" };
  }

  // Claim the request (pending → processing); a concurrent approval loses here.
  const claimed = await patchWithdrawal(
    withdrawalId,
    {
      status: "processing",
      decided_at: new Date().toISOString(),
      decided_by: adminId,
    },
    "&status=eq.pending"
  );
  if (!claimed) {
    await patchPayout(payout.id, { status: "failed", failure_reason: "Withdrawal was already decided" });
    return { ok: false, status: 409, error: "Withdrawal already decided" };
  }

  // Hold the funds. If this fails, release the claim so the admin can retry.
  const debitId = await insertLedger({
    user_id: withdrawal.user_id,
    type: "withdrawal",
    amount: -amount,
    status: "processed",
  });
  if (!debitId) {
    await patchWithdrawal(withdrawalId, { status: "pending", decided_at: null, decided_by: null }, "&status=eq.processing");
    await patchPayout(payout.id, { status: "failed", failure_reason: "Could not book the withdrawal" });
    return { ok: false, status: 502, error: "Could not book the withdrawal — please retry" };
  }

  return initiateTransfer({ payout, withdrawal: claimed, reference, recipientCode, amountKobo });
}

/**
 * Send the transfer for a persisted payout attempt. Shared by the approval
 * path and retries. On any error the reference is verified before deciding
 * whether a retry with a new reference is safe.
 */
async function initiateTransfer(input: {
  payout: PayoutRecord;
  withdrawal: { id: string; amount: number; status: string; reason: string | null };
  reference: string;
  recipientCode: string;
  amountKobo: number;
}): Promise<PayoutResult<ApprovalOutcome>> {
  const { payout, withdrawal, reference, recipientCode, amountKobo } = input;
  const commission = money(Number(withdrawal.amount) * WITHDRAWAL_COMMISSION_SHARE);

  try {
    const transfer = await paystackInitiateTransfer({
      amountKobo,
      recipient: recipientCode,
      reference,
      reason: `Zephyra payout ${reference.slice(-8)}`,
    });

    const status = transfer.status === "otp" ? "otp_required" : "queued";
    const updated = await patchPayout(payout.id, {
      status,
      transfer_code: transfer.transfer_code ?? null,
    });

    return {
      ok: true,
      data: {
        withdrawal: { ...withdrawal, status: "processing" },
        payout: updated ?? payout,
        payoutUsd: Number(payout.amount_usd),
        commission,
      },
    };
  } catch (err) {
    // The request may have reached Paystack even though we saw an error —
    // verify the reference before declaring the attempt failed.
    let existing = null;
    try {
      existing = await verifyQuietly(reference);
    } catch {
      existing = null;
    }

    if (existing) {
      if (TERMINAL.includes(existing.status)) {
        await settlePayout(reference);
        const settled = await fetchPayout(payout.id);
        return {
          ok: true,
          data: {
            withdrawal: { ...withdrawal, status: "processing" },
            payout: settled ?? payout,
            payoutUsd: Number(payout.amount_usd),
            commission,
          },
        };
      }
      const status = existing.status === "otp" ? "otp_required" : "queued";
      const updated = await patchPayout(payout.id, {
        status,
        transfer_code: existing.transfer_code ?? null,
      });
      return {
        ok: true,
        data: {
          withdrawal: { ...withdrawal, status: "processing" },
          payout: updated ?? payout,
          payoutUsd: Number(payout.amount_usd),
          commission,
        },
      };
    }

    const message = err instanceof Error ? err.message : "Paystack transfer failed";
    await patchPayout(payout.id, {
      status: "failed",
      failure_reason: message.slice(0, 300),
    });
    return {
      ok: false,
      status: 502,
      error: `Payout attempt failed (${message}). The funds are held — retry the payout.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Decline / retry
// ---------------------------------------------------------------------------

export async function declineWithdrawal(
  withdrawalId: string,
  adminId: string,
  reason?: string
): Promise<PayoutResult<{ id: string; amount: number; status: string; reason: string | null }>> {
  const updated = await patchWithdrawal(
    withdrawalId,
    {
      status: "declined",
      reason: reason?.slice(0, 300) ?? null,
      decided_at: new Date().toISOString(),
      decided_by: adminId,
    },
    "&status=eq.pending"
  );
  if (!updated) {
    return { ok: false, status: 409, error: "Withdrawal already decided" };
  }
  return { ok: true, data: updated };
}

/**
 * Retry a payout whose initiation failed. The debit is still held, so this
 * creates a new attempt under the same request — never a second debit.
 */
export async function retryPayout(
  withdrawalId: string
): Promise<PayoutResult<ApprovalOutcome>> {
  const withdrawal = await fetchWithdrawal(withdrawalId);
  if (!withdrawal) return { ok: false, status: 404, error: "Withdrawal not found" };
  if (withdrawal.status !== "processing") {
    return { ok: false, status: 409, error: "Only a processing withdrawal can be retried" };
  }
  if (!withdrawal.bank?.code || !withdrawal.account_number || !withdrawal.account_name) {
    return { ok: false, status: 400, error: "The requester has no verified payout account" };
  }

  const previous = await fetchLatestPayout(withdrawalId);
  if (!previous) return { ok: false, status: 409, error: "No payout attempt to retry" };
  if (previous.refunded_at) {
    return { ok: false, status: 409, error: "This payout was refunded — the user must request again" };
  }
  if (previous.status !== "failed") {
    return {
      ok: false,
      status: 409,
      error:
        previous.status === "queued" || previous.status === "otp_required"
          ? "The transfer is still in flight — check its status instead"
          : "The last attempt is already settled",
    };
  }

  const payoutUsd = money(Number(withdrawal.amount) * WITHDRAWAL_PAYOUT_SHARE);
  const amountKobo = Math.round(payoutUsd * USD_TO_NGN * 100);

  const float = await hasFloat(amountKobo);
  if (float === false) {
    return { ok: false, status: 409, error: "The platform's Paystack balance is too low right now" };
  }

  let recipientCode: string;
  try {
    recipientCode = await getOrCreateRecipient({
      userId: withdrawal.user_id,
      bankCode: withdrawal.bank.code,
      accountNumber: withdrawal.account_number,
      accountName: withdrawal.account_name,
    });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "Could not create the transfer recipient",
    };
  }

  const reference = `payout_${randomUUID()}`;
  const createdRes = await supabaseFetch<PayoutRecord[]>(`/rest/v1/payouts?select=*`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      withdrawal_id: withdrawalId,
      user_id: withdrawal.user_id,
      reference,
      recipient_code: recipientCode,
      amount_usd: payoutUsd,
      amount_kobo: amountKobo,
      rate: USD_TO_NGN,
      currency: "NGN",
      status: "initialized",
      attempt: previous.attempt + 1,
    }),
  });
  const payout = createdRes.data?.[0];
  if (createdRes.status !== 201 || !payout) {
    return { ok: false, status: 502, error: "Could not record the retry attempt" };
  }

  return initiateTransfer({
    payout,
    withdrawal: {
      id: withdrawal.id,
      amount: Number(withdrawal.amount),
      status: withdrawal.status,
      reason: withdrawal.reason,
    },
    reference,
    recipientCode,
    amountKobo,
  });
}

// ---------------------------------------------------------------------------
// Settlement (webhook + manual check share this)
// ---------------------------------------------------------------------------

export type SettlementOutcome = {
  reference: string;
  status: string;
  already_settled: boolean;
};

/**
 * Apply Paystack's final state to a payout. Idempotent: the terminal status is
 * claimed with a conditional update, so duplicate webhooks and repeated manual
 * checks can never double-credit commission or double-refund.
 */
export async function settlePayout(
  reference: string
): Promise<PayoutResult<SettlementOutcome>> {
  const payoutRes = await supabaseFetch<PayoutRecord[]>(
    `/rest/v1/payouts?select=*&reference=eq.${encodeURIComponent(reference)}&limit=1`
  );
  const payout = payoutRes.data?.[0];
  if (!payout) return { ok: false, status: 404, error: "Unknown payout reference" };

  if (TERMINAL.includes(payout.status)) {
    return { ok: true, data: { reference, status: payout.status, already_settled: true } };
  }

  let verification;
  try {
    verification = await paystackVerifyTransfer(reference);
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "Could not verify the transfer",
    };
  }

  // Still moving — reflect it and wait.
  if (verification.status === "pending" || verification.status === "otp") {
    const status = verification.status === "otp" ? "otp_required" : "queued";
    await patchPayout(payout.id, {
      status,
      transfer_code: verification.transfer_code ?? payout.transfer_code,
    });
    return { ok: true, data: { reference, status, already_settled: false } };
  }

  if (verification.status === "success") {
    const claimed = await patchPayout(
      payout.id,
      {
        status: "success",
        fee_charged:
          verification.fee_charged != null ? Number(verification.fee_charged) / 100 : payout.fee_charged,
        transfer_code: verification.transfer_code ?? payout.transfer_code,
      },
      `&status=not.in.(${TERMINAL.join(",")})`
    );
    if (!claimed) {
      return { ok: true, data: { reference, status: "success", already_settled: true } };
    }

    const withdrawalRes = await supabaseFetch<{ amount: number }[]>(
      `/rest/v1/withdrawals?select=amount&id=eq.${payout.withdrawal_id}&limit=1`
    );
    const requestAmount = Number(withdrawalRes.data?.[0]?.amount ?? 0);
    const commission = money(
      requestAmount > 0
        ? requestAmount * WITHDRAWAL_COMMISSION_SHARE
        : Number(payout.amount_usd) * (WITHDRAWAL_COMMISSION_SHARE / WITHDRAWAL_PAYOUT_SHARE)
    );
    if (commission > 0) {
      await insertLedger({
        user_id: PLATFORM_USER_ID,
        type: "platform_earnings",
        amount: commission,
      });
    }

    await patchWithdrawal(payout.withdrawal_id, { status: "paid" }, "&status=eq.processing");
    return { ok: true, data: { reference, status: "success", already_settled: false } };
  }

  // failed | reversed → terminal, refund exactly once.
  const finalStatus = verification.status === "reversed" ? "reversed" : "failed";

  // One conditional claim carries the terminal status AND the refund marker, so
  // exactly one caller can issue the refund.
  const claimed = await patchPayout(
    payout.id,
    {
      status: finalStatus,
      failure_reason: `Paystack reported ${finalStatus}`,
      fee_charged:
        verification.fee_charged != null ? Number(verification.fee_charged) / 100 : payout.fee_charged,
      refunded_at: new Date().toISOString(),
    },
    `&status=not.in.(${TERMINAL.join(",")})&refunded_at=is.null`
  );
  if (!claimed) {
    return { ok: true, data: { reference, status: finalStatus, already_settled: true } };
  }

  const withdrawalRes = await supabaseFetch<{ amount: number }[]>(
    `/rest/v1/withdrawals?select=amount&id=eq.${payout.withdrawal_id}&limit=1`
  );
  const requestAmount = Number(withdrawalRes.data?.[0]?.amount ?? 0);
  if (requestAmount > 0) {
    await insertLedger({
      user_id: payout.user_id,
      type: "withdrawal_refund",
      amount: money(requestAmount),
    });
  }
  await patchWithdrawal(
    payout.withdrawal_id,
    { status: "failed", reason: `Payout failed — refunded (${finalStatus})` },
    "&status=eq.processing"
  );

  return { ok: true, data: { reference, status: finalStatus, already_settled: false } };
}
