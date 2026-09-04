"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircuitBoard, Cpu, MemoryStick, Network } from "lucide-react";
import { Button } from "@/components/ui/button";

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

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PurchaseClient() {
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/nodes/purchase")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d) => {
        if (!ignore) setTiers(d.tiers ?? []);
      })
      .catch(() => {
        if (!ignore) setError("Could not load tiers.");
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function buy(tierId: string) {
    setBusyId(tierId);
    setError(null);
    const res = await fetch("/api/nodes/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tierId }),
    });
    if (!res.ok) {
      setBusyId(null);
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not start payment.");
      return;
    }
    const d = await res.json().catch(() => null);
    if (!d?.authorization_url) {
      setBusyId(null);
      setError("Could not start payment.");
      return;
    }
    // Redirect to Paystack's hosted checkout; busyId stays set meanwhile.
    window.location.assign(d.authorization_url);
  }

  if (error && !tiers) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!tiers) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-md p-4 pb-10">
      <Link
        href="/nodes"
        aria-label="Back to my nodes"
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-5" />
      </Link>

      <header className="mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">Purchase a node</h1>
        <p className="text-sm text-muted-foreground">
          Pick a tier — any tier is available at any time.
        </p>
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
              {busyId === t.id ? "Contacting Paystack…" : "Purchase"}
            </Button>
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
