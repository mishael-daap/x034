"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpFromLine, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

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

type Destination = { bank_name: string | null; account_number: string | null };

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
    ]).then(([tx, w, me]) => {
      setBalance(tx.balance ?? 0);
      setWithdrawals(w.withdrawals ?? []);
      const u = me.user;
      setDestination(
        u ? { bank_name: u.bank?.name ?? null, account_number: u.account_number ?? null } : null
      );
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live "what's left" math: balance − requested amount, rounded to cents.
  const parsed = Number(amount);
  const amountValid = Number.isFinite(parsed) && parsed > 0;
  const cents = Math.round((balance ?? 0) * 100);
  const amountCents = amountValid ? Math.round(parsed * 100) : 0;
  const remaining = (cents - amountCents) / 100;
  const exceeds = amountValid && remaining < 0;
  const canWithdraw = amountValid && !exceeds && !withdrawing && balance != null;
  const hasDestination = Boolean(destination?.bank_name && destination.account_number);

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
      {/* Back — icon only */}
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Go back"
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-5" />
      </button>

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
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {amountValid
              ? `You'll have ${money(remaining)} left after this withdrawal.`
              : "Requests are reviewed and paid by the platform admin."}
          </p>
        )}
      </div>

      {/* Payout destination */}
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
          <Link
            href="/me"
            className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {hasDestination ? "Change" : "Add"}
          </Link>
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
          Add your bank details on your profile before requesting a withdrawal.
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
    </div>
  );
}
