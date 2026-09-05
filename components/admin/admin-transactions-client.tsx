"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsMenu } from "@/components/app-shell/settings-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AdminWithdrawal = {
  id: string;
  amount: number; // positive (requested)
  status: "pending" | "approved" | "declined";
  reason: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  created_at: string;
  decided_at: string | null;
  requester: { name: string; email: string | null } | null;
};

type Filter = "all" | "pending" | "approved" | "declined";
type PayoutMode = "simulated" | "paystack";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** Every user's withdrawal request lives here for approval. */
export function AdminTransactionsClient() {
  const [all, setAll] = useState<AdminWithdrawal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<AdminWithdrawal | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // Per-request payout mode (default simulated; Paystack = real transfer).
  const [modes, setModes] = useState<Record<string, PayoutMode>>({});

  const load = useCallback(() => {
    fetch("/api/admin/withdrawals")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d) => setAll(d.withdrawals ?? []))
      .catch(() => setError("Could not load withdrawal requests."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(w: AdminWithdrawal, action: "approve" | "decline", reason?: string) {
    setBusyId(w.id);
    setNotice(null);
    setError(null);
    const res = await fetch(`/api/withdrawals/${w.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "decline"
          ? { action, reason: reason || null }
          : { action, mode: modes[w.id] ?? "simulated" }
      ),
    });
    setBusyId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not update withdrawal");
      return;
    }
    const d = await res.json().catch(() => null);
    const updated = d?.withdrawal;
    if (updated?.status === "declined" && updated?.reason === "Insufficient balance") {
      setNotice(
        `Request for ${money(w.amount)} was declined — the requester's balance no longer covers it.`
      );
    }
    if (d?.payout != null && (modes[w.id] ?? "simulated") === "paystack") {
      setNotice(
        `Approved ${money(w.amount)} — ${money(d.payout)} paid via Paystack, 10% commission kept.`
      );
    }
    setDeclineTarget(null);
    setDeclineReason("");
    load();
  }

  const counts = {
    all: all?.length ?? 0,
    pending: all?.filter((w) => w.status === "pending").length ?? 0,
    approved: all?.filter((w) => w.status === "approved").length ?? 0,
    declined: all?.filter((w) => w.status === "declined").length ?? 0,
  };

  const shown = (all ?? []).filter((w) => filter === "all" || w.status === filter);

  const statusBadge = (w: AdminWithdrawal) => {
    if (w.status === "approved") return <Badge>Approved</Badge>;
    if (w.status === "declined") return <Badge variant="destructive">Declined</Badge>;
    return <Badge variant="outline">Pending</Badge>;
  };

  return (
    <div className="mx-auto w-full max-w-md p-4 pb-10">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            Withdrawal requests from all users. Approve to pay out 90% — 10% commission stays with
            the platform.
          </p>
        </div>
        <SettingsMenu />
      </header>

      {/* Filter chips */}
      {all && (
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "approved", "declined"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors " +
                (filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground")
              }
            >
              {f} · {counts[f]}
            </button>
          ))}
        </div>
      )}

      {notice && <p className="mt-3 text-sm text-emerald-600">{notice}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {!all ? (
        <div className="mt-4 grid gap-2">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {shown.map((w) => {
            const payout = w.amount * 0.9;
            const commission = w.amount - payout;
            return (
              <li key={w.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {w.requester?.name ?? "Unknown"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {w.requester?.email ?? "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-[var(--font-roboto-mono)] text-base font-bold tabular-nums">
                      {money(w.amount)}
                    </p>
                    {statusBadge(w)}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
                  <div>
                    <p className="text-muted-foreground">Pays out (90%)</p>
                    <p className="font-mono font-semibold tabular-nums text-emerald-600">
                      {money(payout)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Commission (10%)</p>
                    <p className="font-mono font-semibold tabular-nums">{money(commission)}</p>
                  </div>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {w.bank_name ?? "—"} · {w.account_number ?? "—"}
                  {w.account_name ? ` · ${w.account_name}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Requested {dateLabel(w.created_at)}
                  {w.decided_at ? ` · Decided ${dateLabel(w.decided_at)}` : ""}
                </p>
                {w.status === "declined" && w.reason && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive/80">
                    <XCircle className="size-3.5" />
                    {w.reason}
                  </p>
                )}
                {w.status === "approved" && w.reason && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    {w.reason}
                  </p>
                )}

                {w.status === "pending" && (
                  <div className="mt-3 grid gap-2">
                    <Select
                      value={modes[w.id] ?? "simulated"}
                      onValueChange={(v) =>
                        setModes((m) => ({ ...m, [w.id]: v as PayoutMode }))
                      }
                    >
                      <SelectTrigger className="w-full" aria-label="Payout mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simulated">Simulated payout (test)</SelectItem>
                        <SelectItem value="paystack">Real payout via Paystack</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busyId === w.id}
                        onClick={() => decide(w, "approve")}
                        className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        {busyId === w.id ? "…" : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === w.id}
                        onClick={() => {
                          setDeclineReason("");
                          setDeclineTarget(w);
                        }}
                        className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Decline dialog (optional reason) */}
      <Dialog
        open={declineTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeclineTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline withdrawal</DialogTitle>
            <DialogDescription>
              {declineTarget
                ? `${declineTarget.requester?.name ?? "User"} requested ${money(declineTarget.amount)}.`
                : ""}{" "}
              Add a reason for the user (optional).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="decline-reason">Reason</Label>
            <Input
              id="decline-reason"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="e.g. Account details could not be verified"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busyId === declineTarget?.id}
              onClick={() => declineTarget && decide(declineTarget, "decline", declineReason)}
            >
              Confirm decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
