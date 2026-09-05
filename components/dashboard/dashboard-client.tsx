"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Server, Settings, ShieldCheck, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RULES_ONBOARDING_KEY } from "@/lib/onboarding";
import { Skeleton } from "@/components/ui/skeleton";
import { RulesDialog } from "@/components/onboarding/rules-dialog";

type User = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  referral_code: string;
  role?: string;
};

type JobStatus = "upcoming" | "locked" | "in_progress" | "completed";

type Job = {
  id: string;
  company: string;
  tier: string;
  total_payout: number;
  starts_at: string;
  required_referrals: number;
  status: JobStatus;
};

type Assignment = {
  job_id: string;
  company: string;
  status: JobStatus;
  starts_at: string;
  duration_hours: number;
  actual_duration_hours: number | null;
  estimated_earnings: number;
};

type NodeInfo = {
  id: string;
  tier_code: string;
  tier_name: string;
  status: string;
  assignment: Assignment | null;
};

type Referral = {
  referral_code: string;
  total_referees: number;
  qualifying_count: number;
};

type DashboardData = {
  balance: number | null;
  nodes: NodeInfo[];
  referral: Referral | null;
  jobs: Job[];
};

const TIER_RANK: Record<string, number> = { C: 1, B: 2, A: 3 };

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDuration(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin < 1) return "under a minute";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Settings sidebar options — extend this list as more actions arrive. */
type MenuItem = { label: string; icon: typeof LogOut; danger?: boolean; onClick: () => void };

export function Dashboard({ user }: { user: User }) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showRules, setShowRules] = useState(false);

  // Right after login the session carries a flag → show the rules debrief once.
  useEffect(() => {
    let pending = false;
    try {
      pending = sessionStorage.getItem(RULES_ONBOARDING_KEY) === "1";
    } catch {
      // storage unavailable — skip the onboarding pop-up
    }
    if (!pending) return;
    const id = window.setTimeout(() => {
      setShowRules(true);
      try {
        sessionStorage.removeItem(RULES_ONBOARDING_KEY);
      } catch {
        // storage unavailable — ignore
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Live clock for commitment timers (refreshed every 30s; impure calls stay out of render).
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/nodes").then((r) => (r.ok ? r.json() : { balance: null, nodes: [] })),
      fetch("/api/referrals/me")
        .then((r) => (r.ok ? r.json() : { referral: null }))
        .catch(() => ({ referral: null })),
      fetch("/api/marketplace").then((r) => (r.ok ? r.json() : { jobs: [] })),
    ])
      .then(([nodes, referral, marketplace]) => {
        setData({
          balance: nodes.balance ?? 0,
          nodes: nodes.nodes ?? [],
          referral: referral.referral ?? null,
          jobs: marketplace.jobs ?? [],
        });
      })
      .catch(() => setError("Could not load your dashboard."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSignOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const menu: MenuItem[] = [];
  if (user.role === "admin") {
    menu.push({ label: "Admin panel", icon: ShieldCheck, onClick: () => router.push("/admin") });
  }
  menu.push({ label: "Sign out", icon: LogOut, danger: true, onClick: handleSignOut });

  // Active commitments = nodes with a live assignment (occupied until its job elapses).
  const now = nowMs;
  const commitments = (data?.nodes ?? []).filter((n) => n.assignment);
  const nodesOwned = (data?.nodes ?? []).length;
  const nodesFree = (data?.nodes ?? []).filter((n) => n.status === "available").length;
  const freeTierRank = (data?.nodes ?? [])
    .filter((n) => !n.assignment)
    .reduce((max, n) => Math.max(max, TIER_RANK[n.tier_code] ?? 0), 0);
  const qualifyingRefs = data?.referral?.qualifying_count ?? 0;
  const curatedJobs = (data?.jobs ?? [])
    .filter(
      (j) =>
        (TIER_RANK[j.tier] ?? 0) <= freeTierRank && j.required_referrals <= qualifyingRefs
    )
    .slice(0, 3);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-md p-6">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md p-6">
      {/* Header: greeting + settings */}
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm text-muted-foreground">{greeting()}</p>
          <h1 className="text-xl font-semibold tracking-tight">{user.name}</h1>
        </div>
        <button
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings className="size-5" />
        </button>
      </header>

      {/* Settings sidebar */}
      <div className={cn("fixed inset-0 z-50", !settingsOpen && "pointer-events-none")}>
        <div
          onClick={() => setSettingsOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/60 transition-opacity",
            settingsOpen ? "opacity-100" : "opacity-0"
          )}
        />
        <aside
          className={cn(
            "absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col border-l border-border bg-card p-4 shadow-2xl transition-transform duration-200",
            settingsOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Settings</h2>
            <button
              aria-label="Close settings"
              onClick={() => setSettingsOpen(false)}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <nav className="mt-6 grid gap-1">
            {menu.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  disabled={signingOut}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    item.danger
                      ? "text-destructive hover:bg-destructive/10"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="size-4" />
                  {signingOut && item.label === "Sign out" ? "Signing out…" : item.label}
                </button>
              );
            })}
          </nav>
          <p className="mt-auto text-xs text-muted-foreground">More options coming soon.</p>
        </aside>
      </div>

      {/* Balance */}
      {!data ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <section className="rounded-xl bg-[linear-gradient(135deg,var(--color-primary),oklch(0.42_0.11_70))] p-6 text-primary-foreground ring-1 ring-black/10">
          <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
            <Wallet className="size-4" />
            Available balance
          </div>
          <p className="mt-2 font-[var(--font-roboto-mono)] text-6xl font-black tabular-nums tracking-tighter">
            {data.balance == null ? "—" : money(data.balance)}
          </p>
        </section>
      )}

      {/* Nodes */}
      {!data ? (
        <Skeleton className="mt-6 h-36 w-full rounded-xl" />
      ) : (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Nodes</h2>
            <Link href="/nodes" className="text-xs font-medium text-primary">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/nodes"
              className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50"
            >
              <Server className="size-4 text-muted-foreground" />
              <p className="mt-3 text-xs text-muted-foreground">Nodes owned</p>
              <p className="mt-1 text-xl font-semibold tracking-tight">{nodesOwned}</p>
            </Link>
            <Link
              href="/nodes"
              className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50"
            >
              <Server className="size-4 text-emerald-500" />
              <p className="mt-3 text-xs text-muted-foreground">Nodes free</p>
              <p className="mt-1 text-xl font-semibold tracking-tight">{nodesFree}</p>
            </Link>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Free nodes are not committed — browse the marketplace and put them to work.
          </p>
        </section>
      )}

      {/* Active commitments */}
      {!data ? (
        <Skeleton className="mt-8 h-32 w-full rounded-xl" />
      ) : (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Active commitments</h2>
            <Link href="/nodes" className="text-xs font-medium text-primary">
              View all
            </Link>
          </div>
          {commitments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active commitments. Browse the marketplace to commit a node.
            </p>
          ) : (
            <div className="grid gap-2">
              {commitments.map((n) => {
                const a = n.assignment as Assignment;
                const start = new Date(a.starts_at).getTime();
                const totalH = a.actual_duration_hours ?? a.duration_hours;
                const end = start + totalH * 3_600_000;
                const running = now >= start && now < end;
                const earnedSoFar = running
                  ? a.estimated_earnings * Math.min(Math.max((now - start) / (end - start), 0), 1)
                  : 0;
                return (
                  <Link
                    key={n.id}
                    href={`/marketplace/${a.job_id}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-card px-4 py-2.5 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.company}</p>
                      <p className="text-xs text-muted-foreground">Tier {n.tier_code} node</p>
                    </div>
                    {running ? (
                      <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-emerald-500">
                        +${earnedSoFar.toFixed(2)}
                      </p>
                    ) : (
                      <p className="shrink-0 text-xs text-muted-foreground">
                        Starts in {fmtDuration(start - now)}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Curated marketplace — compact vertical list in a distinct container */}
      {!data ? (
        <Skeleton className="mt-8 h-56 w-full rounded-xl" />
      ) : (
        <section className="mt-8">
          <div className="rounded-xl bg-[#171717] p-4 ring-1 ring-border/50">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Compute market</h2>
              <Link
                href="/marketplace"
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                View all
              </Link>
            </div>
            {curatedJobs.length === 0 ? (
              <Link
                href="/marketplace"
                className="flex items-center justify-center rounded-lg py-6 text-center text-xs font-medium text-primary"
              >
                View marketplace
              </Link>
            ) : (
              <div>
                {curatedJobs.map((job) => {
                  const start = new Date(job.starts_at).getTime();
                  return (
                    <Link
                      key={job.id}
                      href={`/marketplace/${job.id}`}
                      className="flex items-center gap-3 border-b border-border/60 py-3 transition-colors hover:bg-muted/30 last:border-b-0"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <div className="size-2 rounded-full bg-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate text-sm font-medium">{job.company}</p>
                          <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-emerald-600">
                            {money(job.total_payout)}
                          </p>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Starts in {fmtDuration(start - now)} · Tier {job.tier}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground/80">
                          {job.required_referrals > 0
                            ? `Unlock · ${job.required_referrals} referrals required`
                            : "Unlock · no referrals required"}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Rules debrief — shown right after login (dismissable). */}
      <RulesDialog open={showRules} onOpenChange={setShowRules} />
    </div>
  );
}
