"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldError } from "@/components/ui/field-error";
import { moneyError } from "@/lib/validation";
import { SettingsMenu } from "@/components/app-shell/settings-menu";

const PRESETS = [10, 25, 50, 100, 200];

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DepositClient({ prefillAmount }: { prefillAmount?: number | null }) {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState(prefillAmount && prefillAmount > 0 ? String(prefillAmount) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/transactions")
      .then((r) => (r.ok ? r.json() : { balance: null }))
      .then((d) => {
        if (!ignore) setBalance(d.balance == null ? null : Number(d.balance));
      })
      .catch(() => {
        if (!ignore) setBalance(0);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const parsed = Number(amount);
  const amountErr = amount.trim() ? moneyError(amount, { label: "Deposit amount" }) : null;
  const amountValid = amountErr === null && Number.isFinite(parsed) && parsed > 0;
  const amountCents = amountValid ? Math.round(parsed * 100) : 0;

  async function handleCard() {
    if (!amountValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/deposits/paystack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountCents / 100 }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setBusy(false);
        setError(d?.error ?? "Could not start payment.");
        return;
      }
      if (d?.authorization_url) window.location.assign(d.authorization_url);
      else {
        setBusy(false);
        setError("Could not start payment.");
      }
    } catch {
      setBusy(false);
      setError("Could not start payment.");
    }
  }

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

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Deposit</h1>
      <p className="text-sm text-muted-foreground">
        Top up your wallet with a card payment.
      </p>

      {balance == null ? (
        <Skeleton className="mt-4 h-24 w-full rounded-xl" />
      ) : (
        <section className="mt-4 flex items-center justify-between rounded-xl bg-[linear-gradient(135deg,var(--color-primary),oklch(0.42_0.11_70))] p-4 text-primary-foreground ring-1 ring-black/10">
          <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
            <Wallet className="size-4" />
            Wallet balance
          </div>
          <p className="font-[var(--font-roboto-mono)] text-2xl font-black tabular-nums tracking-tighter">
            {money(balance)}
          </p>
        </section>
      )}

      <div className="mt-5 grid gap-1.5">
        <Label htmlFor="deposit-amount">Amount (USD)</Label>
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
          }}
        />
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setAmount(String(p));
                setError(null);
              }}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                (Number(amount) === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground")
              }
            >
              ${p}
            </button>
          ))}
        </div>
        <FieldError message={amountErr} />
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <Button
        onClick={handleCard}
        disabled={!amountValid || busy}
        className="mt-4 h-11 w-full"
      >
        <ArrowDownToLine />
        {busy ? "Contacting Paystack…" : "Pay"}
      </Button>
    </div>
  );
}
