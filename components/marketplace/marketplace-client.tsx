"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

const STATUS_LABEL: Record<Job["status"], string> = {
  upcoming: "Upcoming",
  commit_window: "Open",
  in_progress: "In progress",
  completed: "Completed",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!jobs) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-4 p-4 pb-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
        <p className="text-sm text-muted-foreground">Commit a node to a job and earn.</p>
      </header>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open jobs right now.</p>
      ) : (
        jobs.map((job) => (
          <Link key={job.id} href={`/marketplace/${job.id}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{job.company}</CardTitle>
                  <Badge variant="secondary">Tier {job.tier}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. per node</span>
                  <span className="font-medium">≈ {job.estimated_earnings.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total pool</span>
                  <span>{job.total_payout.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Starts</span>
                  <span>{fmt(job.starts_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pool</span>
                  <span>
                    {job.pool_count}/{job.max_pool} nodes
                  </span>
                </div>
                {job.required_referrals > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Referrals needed</span>
                    <span>{job.required_referrals}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline">{STATUS_LABEL[job.status]}</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
