"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Assignment = {
  job_id: string;
  company: string;
  status: string;
  estimated_earnings: number;
  starts_at: string;
  duration_hours: number;
  actual_duration_hours: number | null;
};

type NodeItem = {
  id: string;
  tier_code: string;
  tier_name: string;
  vcpu: number;
  ram_gb: number;
  gpu: number;
  bandwidth: number;
  status: "available" | "committed" | "active";
  assignment: Assignment | null;
};

type NodesData = { balance: number; nodes: NodeItem[] };

/** Whole-card color coding by node status. */
const STATUS_STYLE: Record<
  NodeItem["status"],
  { label: string; card: string; dot: string; text: string }
> = {
  available: {
    label: "Available",
    card: "bg-card",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
  },
  committed: {
    label: "Committed",
    card: "bg-primary/10",
    dot: "bg-primary",
    text: "text-primary",
  },
  active: {
    label: "Running",
    card: "bg-emerald-500/10",
    dot: "bg-emerald-500",
    text: "text-emerald-500",
  },
};

export function NodesClient() {
  const [data, setData] = useState<NodesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/nodes")
      .then((r) => {
        if (r.status === 401) return { balance: 0, nodes: [] };
        if (!r.ok) return Promise.reject(new Error("bad"));
        return r.json();
      })
      .then((d) => {
        if (!ignore) setData(d);
      })
      .catch(() => {
        if (!ignore) setError("Could not load your nodes.");
      });
    return () => {
      ignore = true;
    };
  }, []);

  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  const { nodes } = data;

  return (
    <div className="mx-auto w-full max-w-md p-4 pb-10">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My nodes</h1>
          <p className="text-sm text-muted-foreground">
            {nodes.length} node{nodes.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/nodes/purchase">
          <Button className="h-9">
            <Plus />
            Purchase
          </Button>
        </Link>
      </header>

      {nodes.length === 0 ? (
        <div className="rounded-xl bg-card p-6 text-center ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">
            You don&apos;t own any nodes yet. Buy one to start earning from compute jobs.
          </p>
          <Link href="/nodes/purchase">
            <Button className="mt-4 h-10 w-full">Purchase a node</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {nodes.map((n) => {
            const style = STATUS_STYLE[n.status];
            return (
              <div
                key={n.id}
                className={cn("rounded-xl p-4", style.card)}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-xs text-muted-foreground">
                    #{n.id.slice(0, 4)}
                  </p>
                  <p
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-medium",
                      style.text
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", style.dot)} />
                    {style.label}
                  </p>
                </div>

                <p className="mt-2 text-lg font-semibold tracking-tight">
                  Tier {n.tier_code} · {n.tier_name}
                </p>

                {n.assignment && (
                  <div className="mt-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Committed to
                    </p>
                    <Link
                      href={`/marketplace/${n.assignment.job_id}`}
                      className="mt-0.5 block truncate text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {n.assignment.company}
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
