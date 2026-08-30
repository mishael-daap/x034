"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

export function PurchaseClient() {
  const router = useRouter();
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
    setBusyId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Purchase failed.");
      return;
    }
    router.push("/nodes");
    router.refresh();
  }

  if (error && !tiers) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!tiers) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-4 p-4 pb-10">
      <header>
        <Link href="/nodes" className="text-sm text-muted-foreground underline underline-offset-4">
          ← My nodes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Purchase a node</h1>
        <p className="text-sm text-muted-foreground">
          Pick a tier. Any tier can be purchased at any time.
        </p>
      </header>

      {tiers.map((t) => (
        <Card key={t.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Tier {t.code} · {t.name}
              </CardTitle>
              <Badge variant="secondary">{t.price.toFixed(0)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Specs</span>
              <span>
                {t.vcpu} vCPU · {t.ram_gb} GB · {t.gpu} GPU · {t.bandwidth} Gbps
              </span>
            </div>
            <Button
              onClick={() => buy(t.id)}
              disabled={busyId === t.id}
              className="mt-2 h-10 w-full"
            >
              {busyId === t.id ? "Purchasing…" : `Buy for ${t.price.toFixed(0)}`}
            </Button>
          </CardContent>
        </Card>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
