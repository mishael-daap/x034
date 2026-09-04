"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  Cpu,
  Database,
  Factory,
  Globe,
  Landmark,
  Rocket,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { lockCutoffMs } from "@/lib/jobs";

type UserNode = { id: string; tier: string; available: boolean };
type UserCtx = { nodes: UserNode[]; committed_count: number } | null;
type Participant = {
  name: string;
  node_id: string;
  owner_id: string;
  tier_code: string;
  status: string;
  committed_at: string;
  mine?: boolean;
};

type JobDetail = {
  id: string;
  company: string;
  tier: string;
  tier_name: string;
  total_payout: number;
  duration_hours: number;
  actual_duration_hours: number | null;
  starts_at: string;
  required_referrals: number;
  pool_count: number;
  max_pool: number;
  estimated_duration: number;
  estimated_earnings: number;
  status: "upcoming" | "locked" | "in_progress" | "completed";
};

const AVATAR_ICONS = [Building2, Landmark, Factory, Cpu, Database, Zap, Globe, Rocket];

const AVATAR_STYLES = [
  "bg-amber-500/15 text-amber-500",
  "bg-sky-500/15 text-sky-500",
  "bg-emerald-500/15 text-emerald-500",
  "bg-rose-500/15 text-rose-500",
  "bg-violet-500/15 text-violet-500",
  "bg-indigo-500/15 text-indigo-500",
];

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Payout-pot color by price range: red < $0.50 · primary $0.50–$1 · success > $1. */
function potColor(value: number): string {
  if (value < 0.5) return "text-red-500";
  if (value > 1) return "text-emerald-500";
  return "text-primary";
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function timeAgo(iso: string, now: number) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${h}h ${m}m` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function JobDetailClient({ jobId }: { jobId: string }) {
  const [data, setData] = useState<{
    job: JobDetail;
    participants: Participant[];
    user: UserCtx;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyNode, setBusyNode] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/marketplace/${jobId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad"))))
      .then((d) => {
        if (!ignore) {
          setData(d);
          setError(null);
        }
      })
      .catch(() => {
        if (!ignore) setError("Could not load this job.");
      });
    return () => {
      ignore = true;
    };
  }, [jobId]);

  // Live pool: while the job hasn't finished, refetch so the pot ÷ pool
  // estimate (and participant list) updates and status flips (open → locked →
  // in progress) without a reload.
  useEffect(() => {
    const status = data?.job.status;
    if (status === "completed") return;
    const id = setInterval(() => {
      fetch(`/api/marketplace/${jobId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setData(d);
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [data?.job.status, jobId]);

  // Lazy lock: once the job has started and isn't locked yet, materialize earnings.
  useEffect(() => {
    const job = data?.job;
    if (
      job &&
      (job.status === "in_progress" || job.status === "completed") &&
      job.actual_duration_hours == null
    ) {
      fetch(`/api/marketplace/${jobId}/lock`, { method: "POST" }).then(() =>
        fetch(`/api/marketplace/${jobId}`)
          .then((r) => r.json())
          .then((d) => setData(d))
          .catch(() => {})
      );
    }
  }, [data, jobId]);

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
    fetch(`/api/marketplace/${jobId}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {});
  }

  async function removeNode(nodeId: string) {
    setRemovingId(nodeId);
    setRemovalError(null);
    const res = await fetch(`/api/marketplace/${jobId}/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId }),
    });
    setRemovingId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setRemovalError(d?.error ?? "Could not remove node.");
      return;
    }
    fetch(`/api/marketplace/${jobId}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {});
  }

  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  const { job, participants, user } = data;
  const now = nowMs;
  const start = new Date(job.starts_at).getTime();
  const end = start + job.estimated_duration * 3_600_000;
  const open = job.status === "upcoming"; // pool open: commits + removes allowed
  const locked = job.status === "locked"; // frozen until start
  const running = job.status === "in_progress";
  const poolFull = job.pool_count >= job.max_pool;
  const myNodes = user?.nodes ?? [];
  const availableNodes = myNodes.filter((n) => n.available);

  const avatarIndex = hash(job.company) % AVATAR_ICONS.length;
  const CompanyIcon = AVATAR_ICONS[avatarIndex];

  return (
    <div className="mx-auto w-full max-w-md p-4 pb-10">
      <Link
        href="/marketplace"
        aria-label="Back to marketplace"
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-5" />
      </Link>

      {/* Company + payout pot on the same level */}
      <header className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-xl",
              AVATAR_STYLES[avatarIndex % AVATAR_STYLES.length]
            )}
          >
            <CompanyIcon className="size-7" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Company
            </p>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{job.company}</h1>
          </div>
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
      </header>

      {/* Tier · Pool · Countdown — equal boxes, timer last */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        <section className="min-w-0 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Tier
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums tracking-tight">
            {job.tier || "—"}
          </p>
        </section>
        <section className="min-w-0 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Pool
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums tracking-tight">
            {job.pool_count}
            <span className="text-muted-foreground">/{job.max_pool}</span>
          </p>
        </section>
        <section className="min-w-0 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {open ? "Locks in" : locked ? "Locked" : running ? "Ends in" : "Status"}
          </p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums tracking-tight">
            {open ? (
              fmtCountdown(lockCutoffMs(job.starts_at) - now)
            ) : locked ? (
              fmtCountdown(start - now)
            ) : running ? (
              fmtCountdown(end - now)
            ) : (
              "Done"
            )}
          </p>
        </section>
      </div>

      {/* Minute details */}
      <section className="mt-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="grid gap-2 text-sm">
          <Detail k="Total work" v={`${job.duration_hours}h with one node`} />
          <Detail k="Minimum tier" v={`Tier ${job.tier} (${job.tier_name})`} />
          <Detail k="Starts" v={fmt(job.starts_at)} />
          <Detail k="Payout pot" v={money(job.total_payout)} />
          {job.required_referrals > 0 && (
            <Detail k="Referrals required" v={String(job.required_referrals)} />
          )}
        </div>

        {/* Commit controls (open + signed in) — one button, pick the idle node */}
        {open && (
          <div className="mt-4 flex flex-col gap-2">
            {!user && (
              <Link href="/login">
                <Button className="h-10 w-full">Sign in to commit</Button>
              </Link>
            )}
            {user && poolFull && (
              <Button variant="secondary" disabled className="h-10 w-full">
                Pool is at capacity
              </Button>
            )}
            {user && !poolFull && myNodes.length === 0 && (
              <Link href="/nodes/purchase">
                <Button className="h-10 w-full">Purchase a node</Button>
              </Link>
            )}
            {user && !poolFull && myNodes.length > 0 && availableNodes.length === 0 && (
              <>
                <Button variant="secondary" disabled className="h-10 w-full">
                  No idle nodes to commit
                </Button>
                <Link href="/nodes/purchase">
                  <Button variant="outline" className="h-10 w-full">
                    Buy another node
                  </Button>
                </Link>
              </>
            )}
            {user && !poolFull && availableNodes.length > 0 && (
              <div className="relative">
                <Button
                  onClick={() => setMenuOpen((v) => !v)}
                  disabled={busyNode != null}
                  className="h-10 w-full"
                >
                  {busyNode ? "Committing…" : "Commit node"}
                  <ChevronDown className="size-4" />
                </Button>
                {menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute inset-x-0 top-full z-50 mt-2 rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10">
                      {availableNodes.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => {
                            setMenuOpen(false);
                            commit(n.id);
                          }}
                          className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-muted"
                        >
                          <span>Commit Tier {n.tier} node</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            #{n.id.slice(-4)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {user && (user.committed_count ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                You have {user.committed_count} node{user.committed_count === 1 ? "" : "s"}{" "}
                committed to this job
              </p>
            )}
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          </div>
        )}
      </section>

      {/* Pool participants */}
      <section className="mt-5 rounded-xl bg-[#07070a] p-4 ring-1 ring-border/50">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pool participants</h2>
          <Badge variant="outline">{participants.length}</Badge>
        </div>
        {participants.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No nodes committed yet — be the first.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {participants.map((p, i) => (
              <li key={`${p.node_id}-${i}`} className="flex items-center gap-3 py-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <div className="size-2 rounded-full bg-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    <span className="font-mono text-primary">#{p.node_id.slice(0, 4)}</span>
                    <span className="text-muted-foreground"> · </span>
                    {p.name}
                    {p.mine && (
                      <span className="ml-2 text-[11px] font-normal uppercase tracking-wider text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {timeAgo(p.committed_at, now)}
                  </p>
                </div>
                {p.mine && open && p.status === "committed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeNode(p.node_id)}
                    disabled={removingId === p.node_id}
                  >
                    {removingId === p.node_id ? "Removing…" : "Remove"}
                  </Button>
                )}
              </li>
            ))}
            {removalError && (
              <p className="mt-2 text-xs text-destructive">{removalError}</p>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
