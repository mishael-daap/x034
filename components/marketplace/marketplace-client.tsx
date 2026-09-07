"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SettingsMenu } from "@/components/app-shell/settings-menu";

type Job = {
  id: string;
  company: string;
  tier: string;
  tier_name: string;
  total_payout: number;
  duration_hours: number;
  starts_at: string;
  required_referrals: number;
  pool_count: number;
  max_pool: number;
  estimated_duration: number;
  estimated_earnings: number;
  status: "upcoming" | "locked" | "in_progress" | "completed";
};

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Payout-pot color by price range: red < $0.50 · primary $0.50–$1 · success > $1. */
function potColor(value: number): string {
  if (value < 0.5) return "text-red-500";
  if (value > 1) return "text-emerald-500";
  return "text-primary";
}

/** Compact human countdown for list cards (5s-polled, so no live ticker needed). */
function fmtTil(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 0)}m`;
}

export function MarketplaceClient() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Live clock for countdowns (impure Date.now() stays out of render).
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let ignore = false;
    fetch("/api/marketplace")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d) => {
        if (!ignore) setJobs(d.jobs ?? []);
      })
      .catch(() => {
        if (!ignore) setError("Could not load the marketplace.");
      });
    return () => {
      ignore = true;
    };
  }, []);

  // Live per-node figures: refresh as pools change while browsing. The same
  // 5s beat advances the clock so countdowns (starts/ends in) stay current.
  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
      fetch("/api/marketplace")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setJobs(d.jobs ?? []);
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, []);

  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!jobs) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-md p-4 pb-10">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
          <p className="text-sm text-muted-foreground">Commit a node to a job and earn.</p>
        </div>
        <SettingsMenu />
      </header>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No jobs on the board right now.</p>
      ) : (
        <div className="grid gap-3">
          {jobs.map((job) => {
            const now = nowMs;
            const start = new Date(job.starts_at).getTime();
            const end = start + job.estimated_duration * 3_600_000;
            const running = job.status === "in_progress";
            const frozen = job.status === "locked";
            return (
              <Link
                key={job.id}
                href={`/marketplace/${job.id}`}
                className="block rounded-xl bg-card p-5 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Company
                    </p>
                    <h2 className="mt-0.5 truncate text-base font-semibold tracking-tight">
                      {job.company}
                    </h2>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Per node
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 font-mono text-3xl font-bold tabular-nums tracking-tight",
                        potColor(job.estimated_earnings)
                      )}
                    >
                      {money(job.estimated_earnings)}
                    </p>
                  </div>
                </div>

                <p
                  className={cn(
                    "mt-4 font-mono text-sm tabular-nums",
                    running
                      ? "text-emerald-500"
                      : frozen
                        ? "text-amber-500"
                        : "text-muted-foreground"
                  )}
                >
                  {job.status === "upcoming" && (
                    <>
                      {job.pool_count}/{job.max_pool} nodes
                    </>
                  )}
                  {frozen && <>Pool locked · starts in {fmtTil(start - now)}</>}
                  {running && (
                    <>
                      {job.pool_count}/{job.max_pool} nodes running · ends in{" "}
                      {fmtTil(end - now)}
                    </>
                  )}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
