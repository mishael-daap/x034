"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, Check, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DepositClient() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deposited, setDeposited] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/transactions")
      .then((r) => (r.ok ? r.json() : { balance: null }))
      .then((d) => {
        if (!ignore) setBalance(d.balance ?? 0);
      })
      .catch(() => {
        if (!ignore) setBalance(0);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const parsed = Number(amount);
  const amountValid = Number.isFinite(parsed) && parsed > 0;
  const cents = Math.round((balance ?? 0) * 100);
  const amountCents = amountValid ? Math.round(parsed * 100) : 0;
  const after = (cents + amountCents) / 100;
  const canDeposit = amountValid && !depositing && balance != null;

  async function handleDeposit() {
    if (!canDeposit) return;
    setDepositing(true);
    setError(null);
    setDeposited(false);
    const res = await fetch("/api/deposits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountCents / 100 }),
    });
    setDepositing(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not complete deposit");
      return;
    }
    const d = await res.json().catch(() => null);
    if (d?.balance != null) setBalance(d.balance);
    setDeposited(true);
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

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Deposit</h1>
      <p className="text-sm text-muted-foreground">
        Add test funds to your wallet. Sandbox currency only — no real money.
      </p>

      {balance == null ? (
        <Skeleton className="mt-4 h-36 w-full rounded-xl" />
      ) : (
        <section className="mt-4 rounded-xl bg-[linear-gradient(135deg,var(--color-primary),oklch(0.42_0.11_70))] p-6 text-primary-foreground ring-1 ring-black/10">
          <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
            <Wallet className="size-4" />
            {amountValid ? "Balance after deposit" : "Available balance"}
          </div>
          <p className="mt-2 font-[var(--font-roboto-mono)] text-5xl font-black tabular-nums tracking-tighter">
            {amountValid ? money(after) : money(balance)}
          </p>
          {amountValid && (
            <p className="mt-1 text-xs text-primary-foreground/70">
              Depositing {money(amountCents / 100)}
            </p>
          )}
        </section>
      )}

      <div className="mt-6 grid gap-1.5">
        <Label htmlFor="deposit-amount">Deposit amount</Label>
        <Input
          id="deposit-amount"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError(null);
            setDeposited(false);
          }}
        />
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : amountValid ? (
          <p className="text-sm text-muted-foreground">
            You&apos;ll have {money(after)} in your wallet after this deposit.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Deposits credit your wallet instantly.
          </p>
        )}
      </div>

      <Button onClick={handleDeposit} disabled={!canDeposit} className="mt-4 w-full">
        <ArrowDownToLine />
        {depositing ? "Depositing…" : "Deposit funds"}
      </Button>

      {deposited && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-emerald-600">
          <Check className="size-4" />
          Deposited {money(amountCents / 100)}.{" "}
          <Link href="/me" className="font-medium underline underline-offset-4">
            Back to profile
          </Link>
        </p>
      )}
    </div>
  );
}
