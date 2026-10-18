"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpFromLine, Loader2, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsMenu } from "@/components/app-shell/settings-menu";
import { BankSelect } from "@/components/bank-select";
import { FieldError } from "@/components/ui/field-error";
import { FitText } from "@/components/ui/fit-text";
import { accountNumberError, moneyError } from "@/lib/validation";
import type { WithdrawalPolicyState } from "@/lib/withdrawal-policy";

type WithdrawMethod = { mode: "input" | "presets"; presets: number[] };

type Withdrawal = {
  id: string;
  amount: number; // positive
  status: "pending" | "processing" | "paid" | "failed" | "declined";
  reason: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  created_at: string;
  decided_at: string | null;
  payout: { status: string; failure_reason: string | null; amount_usd: number } | null;
};

type Bank = { id: string; name: string };

type Destination = {
  bank_id: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
};

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const maskAccount = (n: string | null) => (n && n.length >= 4 ? `••••${n.slice(-4)}` : "");

export function WithdrawClient() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [amount, setAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Withdrawal amount method chosen by the admin (input vs fixed-amount buttons).
  const [method, setMethod] = useState<WithdrawMethod>({ mode: "input", presets: [] });
  // When withdrawals are allowed (admin-controlled window) + the popup copy.
  const [policy, setPolicy] = useState<WithdrawalPolicyState | null>(null);
  // USD→NGN rate from the server, for the "you receive ₦X" preview.
  const [rate, setRate] = useState(1400);
  const [closedPopup, setClosedPopup] = useState<{
    message: string;
    nextOpen: string | null;
  } | null>(null);

  // Bank-editor dialog state (add / change payout account right here).
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankId, setBankId] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [savingBank, setSavingBank] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/transactions")
        .then((r) => (r.ok ? r.json() : { balance: null }))
        .catch(() => ({ balance: null })),
      fetch("/api/withdrawals")
        .then((r) => (r.ok ? r.json() : { withdrawals: [] }))
        .catch(() => ({ withdrawals: [] })),
      fetch("/api/me")
        .then((r) => (r.ok ? r.json() : { user: null }))
        .catch(() => ({ user: null })),
      fetch("/api/banks")
        .then((r) => (r.ok ? r.json() : { banks: [] }))
        .catch(() => ({ banks: [] })),
      fetch("/api/withdraw/method")
        .then((r) => (r.ok ? r.json() : { mode: "input", presets: [], policy: null }))
        .catch(() => ({ mode: "input", presets: [], policy: null })),
    ]).then(([tx, w, me, b, m]) => {
      setBalance(tx.balance ?? 0);
      setWithdrawals(w.withdrawals ?? []);
      setMethod(m?.mode === "presets" ? { mode: "presets", presets: m.presets ?? [] } : { mode: "input", presets: [] });
      setPolicy(m?.policy ?? null);
      if (typeof m?.usd_to_ngn === "number" && m.usd_to_ngn > 0) setRate(m.usd_to_ngn);
      const u = me.user;
      setDestination(
        u
          ? {
              bank_id: u.bank?.id ?? null,
              bank_name: u.bank?.name ?? null,
              account_number: u.account_number ?? null,
              account_name: u.account_name ?? null,
            }
          : null
      );
      setBanks(b.banks ?? []);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live "what's left" math: balance − requested amount, rounded to cents.
  const parsed = Number(amount);
  const amountErr = amount.trim() ? moneyError(amount, { label: "Withdrawal amount" }) : null;
  const amountValid = amountErr === null && Number.isFinite(parsed) && parsed > 0;
  const cents = Math.round((balance ?? 0) * 100);
  const amountCents = amountValid ? Math.round(parsed * 100) : 0;
  const remaining = (cents - amountCents) / 100;
  const exceeds = amountValid && remaining < 0;
  const activeRequest =
    withdrawals.find((w) => w.status === "pending" || w.status === "processing") ?? null;
  const canWithdraw =
    amountValid && !exceeds && !withdrawing && balance != null && !activeRequest;
  const hasDestination = Boolean(
    destination?.bank_name && destination.account_number && destination.account_name
  );
  // What actually lands in the bank: 90% of the request at the fixed rate.
  const payoutNgn = amountValid && rate > 0 ? Math.round(parsed * 0.9 * rate * 100) / 100 : 0;

  // Bank dialog: require a bank + valid 10-digit account, or both empty (clear).
  const acctErr = accountNumberError(accountNumber, { required: !!bankId }) ?? undefined;
  const bankNeeded = !bankId && accountNumber.trim().length > 0 ? "Select a bank" : undefined;
  const bankHint =
    accountNumber.trim() && !bankId
      ? "Pick the bank for this account number"
      : bankId && !accountNumber.trim()
        ? "Enter the 10-digit account number"
        : undefined;
  const canSaveBank = (bankId && !acctErr) || (!bankId && !accountNumber.trim());

  function openBankEditor() {
    setBankId(destination?.bank_id ?? "");
    setAccountNumber(destination?.account_number ?? "");
    setBankError(null);
    setBankOpen(true);
  }

  async function handleSaveBank() {
    if (!canSaveBank) return;
    setSavingBank(true);
    setBankError(null);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bank: bankId || null,
        account_number: accountNumber.trim() || null,
      }),
    });
    setSavingBank(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setBankError(d?.error ?? "Could not save bank details.");
      return;
    }
    const d = await res.json().catch(() => null);
    const u = d?.user;
    if (u) {
      setDestination({
        bank_id: u.bank?.id ?? null,
        bank_name: u.bank?.name ?? null,
        account_number: u.account_number ?? null,
        account_name: u.account_name ?? null,
      });
    }
    setBankOpen(false);
  }

  async function handleWithdraw() {
    if (!canWithdraw) return;
    // Admin window: show the custom popup instead of calling the API.
    if (policy && !policy.open) {
      setClosedPopup({ message: policy.message, nextOpen: policy.next_open });
      return;
    }
    setWithdrawing(true);
    setError(null);
    const res = await fetch("/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parsed }),
    });
    setWithdrawing(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      if (d?.policy && d.policy.open === false) {
        setClosedPopup({ message: d.error ?? d.policy.message, nextOpen: d.policy.next_open });
        return;
      }
      setError(d?.error ?? "Could not request withdrawal");
      return;
    }
    setAmount("");
    load();
  }

  const fmtNextOpen = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const statusBadge = (w: Withdrawal) => {
    if (w.status === "paid") return <Badge>Paid</Badge>;
    if (w.status === "processing") return <Badge variant="outline">Processing</Badge>;
    if (w.status === "failed") return <Badge variant="destructive">Failed · refunded</Badge>;
    if (w.status === "declined") return <Badge variant="destructive">Declined</Badge>;
    return <Badge variant="outline">Pending review</Badge>;
  };

  return (
    <div className="mx-auto w-full max-w-md p-6">
      {/* Back + settings */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </button>
        <SettingsMenu />
      </div>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Withdraw</h1>

      {balance == null ? (
        <Skeleton className="mt-4 h-36 w-full rounded-xl" />
      ) : (
        <section className="mt-4 rounded-xl bg-[linear-gradient(135deg,var(--color-primary),oklch(0.42_0.11_70))] p-6 text-primary-foreground ring-1 ring-black/10">
          <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
            <Wallet className="size-4" />
            {amountValid && !exceeds ? "Balance after withdrawal" : "Available balance"}
          </div>
          <FitText
            className="mt-2 font-[var(--font-roboto-mono)] text-5xl font-black tabular-nums tracking-tighter"
            title={amountValid && !exceeds ? money(remaining) : money(balance)}
          >
            {amountValid && !exceeds ? money(remaining) : money(balance)}
          </FitText>
          {amountValid && !exceeds && (
            <p className="mt-1 text-xs text-primary-foreground/70">
              Withdrawing {money(amountCents / 100)}
            </p>
          )}
        </section>
      )}

      <div className="mt-6 grid gap-2">
        <Label htmlFor="withdraw-amount">Withdraw amount</Label>
        {method.mode === "presets" && method.presets.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {method.presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setAmount(String(p));
                  setError(null);
                }}
                className={
                  "rounded-full px-4 py-2 text-sm font-semibold transition-colors " +
                  (Number(amount) === p
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground")
                }
              >
                {money(p)}
              </button>
            ))}
          </div>
        ) : (
          <Input
            id="withdraw-amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
          />
        )}
        {amountErr ? (
          <p className="text-sm text-destructive">{amountErr}</p>
        ) : amountValid && exceeds ? (
          <p className="text-sm text-destructive">
            Amount exceeds your available balance ({money(cents / 100)}).
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : amountValid ? (
          <p className="text-sm text-muted-foreground">
            You receive{" "}
            <span className="font-medium text-foreground">
              ₦
              {payoutNgn.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>{" "}
            · 10% commission · ₦{rate.toLocaleString("en-US")}/$
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            A 10% commission applies on all withdrawals.
          </p>
        )}
      </div>

      {/* Payout destination — opens the bank editor as a popup */}
      {destination && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Paid to</p>
            <p className="truncate text-sm font-medium">
              {hasDestination
                ? `${destination.bank_name} ${maskAccount(destination.account_number)}`
                : destination.bank_name
                  ? `${destination.bank_name} — unverified`
                  : "No payout account set"}
            </p>
            {destination.account_name && (
              <p className="truncate text-xs text-muted-foreground">
                {destination.account_name}
              </p>
            )}
          </div>
          <button
            onClick={openBankEditor}
            className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {hasDestination ? "Change" : "Add"}
          </button>
        </div>
      )}

      <Button
        onClick={handleWithdraw}
        disabled={!canWithdraw || !hasDestination}
        className="mt-4 w-full"
      >
        <ArrowUpFromLine />
        {withdrawing ? "Requesting…" : "Withdraw"}
      </Button>
      {activeRequest ? (
        <p className="mt-2 text-sm text-muted-foreground">
          You already have a withdrawal in progress. You can request another once it
          settles.
        </p>
      ) : !hasDestination && destination ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Verify your bank account (bank + 10-digit number) before requesting a
          withdrawal.
        </p>
      ) : null}

      <h2 className="mt-8 text-sm font-medium text-muted-foreground">Withdrawals</h2>
      {withdrawals.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No withdrawal requests yet.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border/70">
          {withdrawals.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 py-3 first:pt-1">
              <div className="min-w-0">
                <p className="font-[var(--font-roboto-mono)] text-sm font-semibold tabular-nums">
                  −{money(w.amount)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(w.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                {w.status === "declined" && w.reason && (
                  <p className="mt-0.5 break-words text-xs text-destructive/80">{w.reason}</p>
                )}
                {w.status === "failed" && (
                  <p className="mt-0.5 break-words text-xs text-destructive/80">
                    {w.payout?.failure_reason ?? "Transfer failed"} — the amount was
                    returned to your balance.
                  </p>
                )}
                {w.status === "processing" && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Paying out — the transfer is on its way to your bank.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">{statusBadge(w)}</div>
            </li>
          ))}
        </ul>
      )}

      {/* Admin popup: why withdrawals are closed right now */}
      <Dialog
        open={closedPopup !== null}
        onOpenChange={(open) => {
          if (!open) setClosedPopup(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdrawal unavailable</DialogTitle>
            <DialogDescription>
              {closedPopup?.message ?? "Please check back later."}
            </DialogDescription>
          </DialogHeader>
          {closedPopup?.nextOpen && (
            <p className="text-sm text-muted-foreground">
              You can withdraw again on {fmtNextOpen(closedPopup.nextOpen)}.
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => setClosedPopup(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / change bank popup */}
      <Dialog
        open={bankOpen}
        onOpenChange={(open) => {
          if (!open) setBankOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasDestination ? "Change bank details" : "Add bank details"}</DialogTitle>
            <DialogDescription>
              Where approved withdrawals are paid out.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bank-dialog">Bank</Label>
              <BankSelect id="bank-dialog" banks={banks} value={bankId} onChange={(v) => { setBankId(v); setBankError(null); }} />
              {bankNeeded && <FieldError message={bankNeeded} />}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bank-account">Account number</Label>
              <Input
                id="bank-account"
                inputMode="numeric"
                maxLength={10}
                value={accountNumber}
                onChange={(e) => {
                  setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10));
                  setBankError(null);
                }}
                placeholder="10-digit account number"
              />
              <FieldError message={acctErr} />
            </div>
            {bankHint && <p className="text-sm text-muted-foreground">{bankHint}</p>}
            {bankError && <p className="text-sm text-destructive">{bankError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveBank} disabled={savingBank || !canSaveBank}>
              {savingBank && <Loader2 className="size-4 animate-spin" />}
              {savingBank ? "Saving…" : "Save bank details"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
