"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircuitBoard, Cpu, MemoryStick, Network, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsMenu } from "@/components/app-shell/settings-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Tier = {
  id: string;
  code: string;
  name: string;
  vcpu: number;
  ram_gb: number;
  gpu: number;
  bandwidth: number;
  price: number;
};

type Insufficient = { balance: number; price: number };

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PurchaseClient() {
  const router = useRouter();
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bought, setBought] = useState<{ tier_code: string; price: number } | null>(null);
  const [insufficient, setInsufficient] = useState<Insufficient | null>(null);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      fetch("/api/nodes/purchase").then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad")))),
      fetch("/api/transactions")
        .then((r) => (r.ok ? r.json() : { balance: null }))
        .catch(() => ({ balance: null })),
    ])
      .then(([d, tx]) => {
        if (ignore) return;
        setTiers(d.tiers ?? []);
        setBalance(tx.balance == null ? null : Number(tx.balance));
      })
      .catch(() => {
        if (!ignore) setError("Could not load node options.");
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function buy(tierId: string) {
    setBusyId(tierId);
    setError(null);
    setBought(null);
    setInsufficient(null);
    const res = await fetch("/api/nodes/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tierId }),
    });
    if (!res.ok) {
      setBusyId(null);
      const d = await res.json().catch(() => null);
      if (d?.code === "INSUFFICIENT_FUNDS") {
        setBalance(d.balance == null ? null : Number(d.balance));
        setInsufficient({ balance: Number(d.balance ?? 0), price: Number(d.price ?? 0) });
        return;
      }
      setError(d?.error ?? "Could not complete purchase.");
      return;
    }
    const d = await res.json().catch(() => null);
    setBusyId(null);
    if (d?.tier_code != null && d?.price != null) {
      setBought({ tier_code: d.tier_code, price: Number(d.price) });
      setTimeout(() => router.push("/nodes"), 1200);
    }
  }

  if (error && !tiers) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!tiers) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-md p-4 pb-10">
      <div className="flex items-center justify-between">
        <Link
          href="/nodes"
          aria-label="Back to my nodes"
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <SettingsMenu />
      </div>

      <header className="mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">Purchase a node</h1>
        <p className="text-sm text-muted-foreground">
          Pick an option — the price is paid from your wallet balance.
        </p>
        {balance != null && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="size-3.5" />
            Wallet balance: {money(balance)}
          </p>
        )}
      </header>

      <div className="mt-4 grid gap-3">
        {tiers.map((t) => (
          <div key={t.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="font-mono text-3xl font-bold tabular-nums tracking-tight">
              {money(t.price)}
            </p>
            <p className="mt-1 text-base font-semibold tracking-tight">
              Tier {t.code} · {t.name}
            </p>

            <ul className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <Cpu className="size-3.5 shrink-0" />
                {t.vcpu} vCPU
              </li>
              <li className="flex items-center gap-2">
                <MemoryStick className="size-3.5 shrink-0" />
                {t.ram_gb} GB
              </li>
              <li className="flex items-center gap-2">
                <CircuitBoard className="size-3.5 shrink-0" />
                {t.gpu} GPU
              </li>
              <li className="flex items-center gap-2">
                <Network className="size-3.5 shrink-0" />
                {t.bandwidth} Gbps
              </li>
            </ul>

            <Button
              onClick={() => buy(t.id)}
              disabled={busyId === t.id}
              className="mt-4 h-10 w-full"
            >
              {busyId === t.id ? "Purchasing…" : "Purchase"}
            </Button>
          </div>
        ))}
      </div>

      {bought && (
        <p className="mt-4 text-center text-sm text-emerald-600">
          Tier {bought.tier_code} purchased for {money(bought.price)}. Redirecting…
        </p>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {/* Insufficient funds → prompt to deposit */}
      <Dialog
        open={insufficient !== null}
        onOpenChange={(open) => {
          if (!open) setInsufficient(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Not enough balance</DialogTitle>
            <DialogDescription>
              This node costs {insufficient ? money(insufficient.price) : ""} but your wallet has{" "}
              {insufficient ? money(insufficient.balance) : ""}. Top up your wallet to continue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInsufficient(null)}>
              Not now
            </Button>
            <Button
              onClick={() =>
                insufficient &&
                router.push(
                  `/deposit?amount=${encodeURIComponent(
                    Math.max(0, Math.round((insufficient.price - insufficient.balance) * 100) / 100)
                  )}`
                )
              }
            >
              Deposit funds
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
