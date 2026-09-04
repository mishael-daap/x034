"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
  status: "upcoming" | "commit_window" | "in_progress" | "completed";
};

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Payout-pot color by price range: red < $0.50 · primary $0.50–$1 · success > $1. */
function potColor(value: number): string {
  if (value < 0.5) return "text-red-500";
  if (value > 1) return "text-emerald-500";
  return "text-primary";
}

export function MarketplaceClient() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Live per-node figures: refresh as pools change while browsing.
  useEffect(() => {
    const id = setInterval(() => {
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
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
        <p className="text-sm text-muted-foreground">Commit a node to a job and earn.</p>
      </header>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open jobs right now.</p>
      ) : (
        <div className="grid gap-3">
          {jobs.map((job) => (
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

              <p className="mt-4 font-mono text-sm tabular-nums text-muted-foreground">
                {job.pool_count}/{job.max_pool} nodes
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
