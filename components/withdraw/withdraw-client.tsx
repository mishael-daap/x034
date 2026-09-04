"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpFromLine, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type Transaction = {
  id: string;
  type: string;
  amount: number;
  status: string | null;
  created_at: string;
};

type Withdrawal = {
  id: string;
  amount: number; // stored negative
  status: string | null;
  created_at: string;
};

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function WithdrawClient() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [amount, setAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/transactions")
      .then((r) => (r.ok ? r.json() : { balance: null, transactions: [] }))
      .then((d) => {
        setBalance(d.balance ?? 0);
        setWithdrawals(
          (d.transactions ?? []).filter((t: Transaction) => t.type === "withdrawal")
        );
      })
      .catch(() => {
        setBalance(0);
        setWithdrawals([]);
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

  async function handleProcess(id: string) {
    setProcessingId(id);
    const res = await fetch(`/api/withdrawals/${id}/process`, { method: "POST" });
    setProcessingId(null);
    if (res.ok) load();
  }

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
              : "Withdrawals are processed after approval; pending ones don't reduce your balance yet."}
          </p>
        )}
      </div>

      <Button
        onClick={handleWithdraw}
        disabled={!canWithdraw}
        className="mt-4 w-full"
      >
        <ArrowUpFromLine />
        {withdrawing ? "Withdrawing…" : "Withdraw"}
      </Button>

      <h2 className="mt-8 text-sm font-medium text-muted-foreground">Withdrawals</h2>
      {withdrawals.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No withdrawals yet.</p>
      ) : (
        <ul className="mt-2 max-h-[170px] divide-y divide-border/70 overflow-y-auto">
          {withdrawals.map((w) => (
            <li key={w.id} className="flex h-14 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-[var(--font-roboto-mono)] text-sm font-semibold tabular-nums">
                  −{money(Math.abs(w.amount))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(w.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={w.status === "processed" ? "default" : "outline"}>
                  {w.status === "processed" ? "Processed" : "Pending"}
                </Badge>
                {w.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleProcess(w.id)}
                    disabled={processingId === w.id}
                    className="px-2.5"
                  >
                    {processingId === w.id ? "…" : "Process"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
