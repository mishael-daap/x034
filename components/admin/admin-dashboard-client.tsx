"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Stats = {
  total_users: number;
  total_nodes: number;
  platform_balance: number;
  platform_revenue: number;
  pending_withdrawals: number;
  pending_payout_total: number;
  open_jobs: number;
};

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AdminDashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/admin/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d) => {
        if (!ignore) setStats(d.stats ?? null);
      })
      .catch(() => {
        if (!ignore) setError("Could not load platform stats.");
      });
    return () => {
      ignore = true;
    };
  }, []);

  const tiles = stats
    ? [
        { label: "Total users", value: String(stats.total_users), mono: false },
        { label: "Total nodes", value: String(stats.total_nodes), mono: false },
        { label: "Platform revenue", value: money(stats.platform_revenue), mono: true },
        {
          label: "Pending withdrawals",
          value: String(stats.pending_withdrawals),
          mono: false,
        },
        {
          label: "Payout requested",
          value: money(stats.pending_payout_total),
          mono: true,
        },
        { label: "Open jobs", value: String(stats.open_jobs), mono: false },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Platform</h1>
      <p className="text-sm text-muted-foreground">Overview for the platform admin.</p>

      {!stats && !error ? (
        <>
          <Skeleton className="mt-4 h-36 w-full rounded-xl" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        </>
      ) : error ? (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      ) : (
        <>
          <section className="mt-4 rounded-xl bg-[linear-gradient(135deg,var(--color-primary),oklch(0.42_0.11_70))] p-6 text-primary-foreground ring-1 ring-black/10">
            <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
              <Wallet className="size-4" />
              Platform balance
            </div>
            <p className="mt-2 font-[var(--font-roboto-mono)] text-5xl font-black tabular-nums tracking-tighter">
              {money(stats?.platform_balance ?? 0)}
            </p>
          </section>

          <div className="mt-3 grid grid-cols-2 gap-3">
            {tiles.map((t) => (
              <div
                key={t.label}
                className="flex min-h-24 flex-col rounded-xl bg-card p-4 ring-1 ring-foreground/10"
              >
                <p className="text-xs text-muted-foreground">{t.label}</p>
                <p
                  className={
                    t.mono
                      ? "mt-auto pt-3 font-[var(--font-roboto-mono)] text-2xl font-bold tabular-nums tracking-tight"
                      : "mt-auto pt-3 text-2xl font-semibold tracking-tight"
                  }
                >
                  {t.value}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
