"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type QualifyingNode = { id: string; tier: string };
type UserCtx = { qualifying_nodes: QualifyingNode[]; committed_node_id: string | null } | null;

type JobDetail = {
  id: string;
  company: string;
  tier: string;
  tier_name: string;
  pay_per_hour: number;
  duration_hours: number;
  actual_duration_hours: number | null;
  starts_at: string;
  required_referrals: number;
  pool_count: number;
  max_pool: number;
  estimated_duration: number;
  estimated_earnings: number;
  status: "upcoming" | "commit_window" | "in_progress" | "completed";
};

const STATUS_LABEL: Record<JobDetail["status"], string> = {
  upcoming: "Upcoming",
  commit_window: "Open for commit",
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

export function JobDetailClient({ jobId }: { jobId: string }) {
  const [data, setData] = useState<{ job: JobDetail; user: UserCtx } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyNode, setBusyNode] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketplace/${jobId}`);
      if (!res.ok) {
        setError("Could not load this job.");
        return;
      }
      const d = await res.json();
      setData(d);
      setError(null);
    } catch {
      setError("Could not load this job.");
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  // Lazy lock: once the job has started and isn't locked yet, materialize earnings.
  useEffect(() => {
    const job = data?.job;
    if (
      job &&
      (job.status === "in_progress" || job.status === "completed") &&
      job.actual_duration_hours == null
    ) {
      fetch(`/api/marketplace/${jobId}/lock`, { method: "POST" }).then(() => load());
    }
  }, [data, jobId, load]);

  async function commit(nodeId: string) {
    setBusyNode(nodeId);
    setActionError(null);
    const res = await fetch(`/api/marketplace/${jobId}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId }),
    });
    setBusyNode(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setActionError(d?.error ?? "Could not commit node.");
      return;
    }
    load();
  }

  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  const { job, user } = data;
  const open = job.status === "upcoming" || job.status === "commit_window";

  return (
    <div className="flex flex-col gap-4 p-4 pb-10">
      <header>
        <Link href="/marketplace" className="text-sm text-muted-foreground underline underline-offset-4">
          ← Marketplace
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{job.company}</h1>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Job details</CardTitle>
            <Badge variant="secondary">Tier {job.tier}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-1.5 text-sm">
          <Row k="Status" v={<Badge variant="outline">{STATUS_LABEL[job.status]}</Badge>} />
          <Row k="Pay / hour" v={job.pay_per_hour.toFixed(2)} />
          <Row k="Total work" v={`${job.duration_hours}h (one node)`} />
          <Row k="Est. duration" v={`${job.estimated_duration.toFixed(2)}h`} />
          <Row k="Est. earnings" v={`≈ ${job.estimated_earnings.toFixed(2)}`} />
          <Row k="Starts" v={fmt(job.starts_at)} />
          <Row k="Pool" v={`${job.pool_count}/${job.max_pool} nodes`} />
          {job.required_referrals > 0 && (
            <Row k="Referrals needed" v={String(job.required_referrals)} />
          )}
        </CardContent>
      </Card>

      {open && (
        <div className="flex flex-col gap-2">
          {!user && (
            <Link href="/login">
              <Button className="h-10 w-full">Sign in to commit</Button>
            </Link>
          )}
          {user && user.committed_node_id && (
            <div className="flex flex-col gap-2">
              <Button variant="secondary" disabled className="h-10 w-full">
                Your node is committed
              </Button>
              <Link href="/nodes">
                <Button variant="outline" className="h-10 w-full">
                  View my nodes
                </Button>
              </Link>
            </div>
          )}
          {user && !user.committed_node_id && user.qualifying_nodes.length === 0 && (
            <Link href="/nodes/purchase">
              <Button className="h-10 w-full">Purchase a node</Button>
            </Link>
          )}
          {user && !user.committed_node_id && user.qualifying_nodes.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">Commit one of your nodes:</p>
              {user.qualifying_nodes.map((n) => (
                <Button
                  key={n.id}
                  onClick={() => commit(n.id)}
                  disabled={busyNode === n.id}
                  className="h-10 w-full"
                >
                  {busyNode === n.id ? "Committing…" : `Commit Tier ${n.tier} node`}
                </Button>
              ))}
            </>
          )}
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
