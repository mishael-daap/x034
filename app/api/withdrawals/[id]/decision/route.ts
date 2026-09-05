import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import {
  USD_TO_NGN,
  WITHDRAWAL_PAYOUT_SHARE,
} from "@/lib/constants";
import {
  paystackCreateRecipient,
  paystackInitiateTransfer,
  resolveBankCode,
} from "@/lib/paystack";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const money = (n: number) => Math.round(n * 100) / 100;

type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  reason: string | null;
  account_number: string | null;
  account_name: string | null;
  bank: { name: string } | null;
  user: { id: string; name: string } | null;
};

type BalanceRow = { balance: number };

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/withdrawals/[id]/decision — admin approves or declines a pending
 * withdrawal (10% platform commission model).
 *
 * approve (mode 'simulated' | 'paystack', default simulated):
 *   - re-check the requester's balance still covers the amount
 *   - paystack mode: initiate a real Paystack transfer of 90% of the request
 *     to the user's saved bank account before anything is booked; on failure
 *     the request stays pending (retry or switch to simulated)
 *   - ledger `withdrawal` row (−full amount, processed)
 *   - request flips to approved. The 90% leaves as the payout; the 10%
 *     commission stays with the platform.
 * decline: flips to declined with an optional reason. No money moves.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }
  const action = body.action;
  if (action !== "approve" && action !== "decline") {
    return json(400, { error: "action must be 'approve' or 'decline'" });
  }
  const mode = body.mode === "paystack" ? "paystack" : "simulated";
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 300)
      : null;

  const wRes = await supabaseFetch<WithdrawalRow[]>(
    `/rest/v1/withdrawals?select=id,user_id,amount,status,reason,account_number,account_name,bank:banks(name),user:users!withdrawals_user_id_fkey(id,name)&id=eq.${id}&limit=1`
  );
  const withdrawal = wRes.data?.[0];
  if (!withdrawal) return json(404, { error: "Withdrawal not found" });
  if (withdrawal.status !== "pending") {
    return json(409, { error: "Withdrawal already decided" });
  }

  const amount = Number(withdrawal.amount);
  const payout = money(amount * WITHDRAWAL_PAYOUT_SHARE);
  const commission = money(amount - payout);
  const decidedAt = new Date().toISOString();
  const decided = { decided_at: decidedAt, decided_by: session.sub };

  if (action === "approve") {
    // Approval-time balance check: decline if the request is no longer covered.
    const balanceRes = await supabaseFetch<BalanceRow[]>(
      `/rest/v1/user_balances?select=balance&user_id=eq.${withdrawal.user_id}`
    );
    const balance =
      balanceRes.status === 200 && balanceRes.data?.length
        ? Number(balanceRes.data[0].balance ?? 0)
        : 0;

    if (balance < amount) {
      return decline("Insufficient balance");
    }

    // ── Real bank payout (Paystack transfer) — only when asked ───────────────
    let transfer: { reference: string; status: string } | null = null;
    if (mode === "paystack") {
      const bankName = withdrawal.bank?.name ?? null;
      const bankCode = resolveBankCode(bankName);
      const accountNumber = withdrawal.account_number?.replace(/\D/g, "") ?? "";
      const recipientName =
        withdrawal.account_name?.trim() || withdrawal.user?.name?.trim() || "Zephyra User";

      if (!bankCode || accountNumber.length < 10) {
        return json(400, {
          error:
            "Cannot pay via Paystack — the user has no supported bank/account on file. Use a simulated payout instead.",
        });
      }

      try {
        const recipient = await paystackCreateRecipient({
          name: recipientName.slice(0, 200),
          accountNumber,
          bankCode,
        });
        const initiated = await paystackInitiateTransfer({
          amountKobo: Math.round(payout * USD_TO_NGN * 100),
          recipient: recipient.recipient_code,
          reference: `payout_${randomUUID()}`,
          reason: `Zephyra payout ${withdrawal.user?.name ?? ""}`.trim(),
        });
        transfer = { reference: initiated.reference, status: initiated.status };
      } catch (err) {
        return json(502, {
          error:
            err instanceof Error
              ? `Paystack transfer failed: ${err.message}`
              : "Paystack transfer failed — the request is still pending.",
        });
      }
    }

    // ── Book the withdrawal (user ledger −full amount) ───────────────────────
    const txRes = await supabaseFetch(`/rest/v1/transactions`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: withdrawal.user_id,
        type: "withdrawal",
        amount: -money(amount),
        status: "processed",
      }),
    });
    if (txRes.status !== 201) {
      return json(502, {
        error: txRes.error ?? "Could not process withdrawal — please retry",
      });
    }

    const upd = await patchWithdrawal({
      status: "approved",
      reason:
        transfer && mode === "paystack"
          ? `Paid via Paystack · ref ${transfer.reference}`
          : null,
      ...decided,
    });
    if (!upd) return json(502, { error: "Could not update withdrawal" });

    return json(200, {
      withdrawal: { ...upd, payout, commission, transfer },
      payout,
      commission,
    });
  }

  return decline(reason ?? undefined);

  async function decline(reasonText?: string) {
    const upd = await patchWithdrawal({
      status: "declined",
      reason: reasonText ?? null,
      ...decided,
    });
    if (!upd) return json(502, { error: "Could not update withdrawal" });
    return json(200, { withdrawal: upd });
  }

  async function patchWithdrawal(fields: Record<string, unknown>) {
    const res = await supabaseFetch<WithdrawalRow[]>(
      `/rest/v1/withdrawals?select=id,user_id,amount,status,reason&id=eq.${id}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(fields),
      }
    );
    return res.data?.[0] ?? null;
  }
}
