"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { FitText } from "@/components/ui/fit-text";
import { SettingsMenu } from "@/components/app-shell/settings-menu";

type Stats = {
  total_users: number;
  total_nodes: number;
  total_income: number;
  balance: number;
  commission_earned: number;
  wallet_balance: number;
  pending_withdrawals: number;
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
        {
          label: "Total users",
          value: String(stats.total_users),
          mono: false,
          href: null as string | null,
        },
        {
          label: "Nodes owned",
          value: String(stats.total_nodes),
          mono: false,
          href: "/admin/nodes" as string | null,
        },
        {
          label: "Pending payouts",
          value: String(stats.pending_withdrawals),
          mono: false,
          href: "/admin/transactions" as string | null,
        },
        {
          label: "Commission earned (10%)",
          value: money(stats.commission_earned),
          mono: true,
          href: null as string | null,
        },
        {
          label: "Open jobs",
          value: String(stats.open_jobs),
          mono: false,
          href: "/admin/marketplace" as string | null,
        },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Zephyra Admin</h1>
          <p className="text-sm text-muted-foreground">Platform overview.</p>
        </div>
        <SettingsMenu />
      </header>

      {!stats && !error ? (
        <>
          <Skeleton className="mt-4 h-32 w-full rounded-xl" />
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
          {/* Admin wallet — withdrawal commission credited here and withdrawable */}
          <section className="mt-4 rounded-xl bg-[linear-gradient(135deg,var(--color-primary),oklch(0.42_0.11_70))] p-6 text-primary-foreground ring-1 ring-black/10">
            <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
              <Wallet className="size-4" />
              Admin wallet
            </div>
            <FitText className="mt-2 font-[var(--font-roboto-mono)] text-5xl font-black tabular-nums tracking-tighter">
              {money(stats?.wallet_balance ?? 0)}
            </FitText>
            <p className="mt-1 text-xs text-primary-foreground/70">
              10% commission credited here from every approved payout
            </p>
            <Link
              href="/withdraw"
              className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-white/20 text-sm font-semibold text-white transition-colors hover:bg-white/30"
            >
              Withdraw
            </Link>
          </section>

          {/* Total income */}
          <section className="mt-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-xs text-muted-foreground">Total income</p>
            <FitText className="mt-1 font-[var(--font-roboto-mono)] text-3xl font-black tabular-nums tracking-tighter">
              {money(stats?.total_income ?? 0)}
            </FitText>
            <p className="mt-1 text-xs text-muted-foreground">
              Everything users have deposited
            </p>
          </section>

          <div className="mt-3 grid grid-cols-2 gap-3">
            {tiles.map((t) => {
              const inner = (
                <>
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
                </>
              );
              const cls =
                "flex min-h-24 flex-col rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors" +
                (t.href ? " hover:bg-muted/50" : "");
              return t.href ? (
                <Link key={t.label} href={t.href} className={cls}>
                  {inner}
                </Link>
              ) : (
                <div key={t.label} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
