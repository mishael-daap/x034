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
import { accountNumberError, moneyError } from "@/lib/validation";

type Withdrawal = {
  id: string;
  amount: number; // positive
  status: "pending" | "approved" | "declined";
  reason: string | null;
  bank_name: string | null;
  account_number: string | null;
  created_at: string;
  decided_at: string | null;
};

type Bank = { id: string; name: string };

type Destination = {
  bank_id: string | null;
  bank_name: string | null;
  account_number: string | null;
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
    ]).then(([tx, w, me, b]) => {
      setBalance(tx.balance ?? 0);
      setWithdrawals(w.withdrawals ?? []);
      const u = me.user;
      setDestination(
        u
          ? {
              bank_id: u.bank?.id ?? null,
              bank_name: u.bank?.name ?? null,
              account_number: u.account_number ?? null,
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
  const canWithdraw = amountValid && !exceeds && !withdrawing && balance != null;
  const hasDestination = Boolean(destination?.bank_name && destination.account_number);

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
      });
    }
    setBankOpen(false);
  }

  async function handleWithdraw() {
    if (!canWithdraw) return;
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
      setError(d?.error ?? "Could not request withdrawal");
      return;
    }
    setAmount("");
    load();
  }

  const statusBadge = (w: Withdrawal) => {
    if (w.status === "approved") return <Badge>Approved</Badge>;
    if (w.status === "declined") return <Badge variant="destructive">Declined</Badge>;
    return <Badge variant="outline">Pending</Badge>;
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
          <p className="mt-2 font-[var(--font-roboto-mono)] text-5xl font-black tabular-nums tracking-tighter">
            {amountValid && !exceeds ? money(remaining) : money(balance)}
          </p>
          {amountValid && !exceeds && (
            <p className="mt-1 text-xs text-primary-foreground/70">
              Withdrawing {money(amountCents / 100)}
            </p>
          )}
        </section>
      )}

      <div className="mt-6 grid gap-1.5">
        <Label htmlFor="withdraw-amount">Withdraw amount</Label>
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
        {amountValid && exceeds ? (
          <p className="text-sm text-destructive">
            Amount exceeds your available balance ({money(cents / 100)}).
          </p>
        ) : amountErr ? (
          <p className="text-sm text-destructive">{amountErr}</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {amountValid
              ? `A 10% commission applies — you'll receive ${money((amountCents / 100) * 0.9)} in your bank.`
              : "Requests are reviewed and paid by the platform admin (10% commission)."}
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
                : "No payout account set"}
            </p>
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
        {withdrawing ? "Requesting…" : "Request withdrawal"}
      </Button>
      {!hasDestination && destination && (
        <p className="mt-2 text-sm text-muted-foreground">
          Add your bank details before requesting a withdrawal.
        </p>
      )}

      <h2 className="mt-8 text-sm font-medium text-muted-foreground">Withdrawals</h2>
      {withdrawals.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No withdrawal requests yet.
        </p>
      ) : (
        <ul className="mt-2 max-h-[194px] divide-y divide-border/70 overflow-y-auto">
          {withdrawals.map((w) => (
            <li key={w.id} className="flex h-16 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-[var(--font-roboto-mono)] text-sm font-semibold tabular-nums">
                  −{money(w.amount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(w.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                {w.status === "declined" && w.reason && (
                  <p className="truncate text-xs text-destructive/80">{w.reason}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">{statusBadge(w)}</div>
            </li>
          ))}
        </ul>
      )}

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
