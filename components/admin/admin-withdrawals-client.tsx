"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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

type AdminWithdrawal = {
  id: string;
  amount: number; // positive
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

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function AdminWithdrawalsClient() {
  const router = useRouter();
  const [all, setAll] = useState<AdminWithdrawal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<AdminWithdrawal | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/withdrawals")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d) => setAll(d.withdrawals ?? []))
      .catch(() => setError("Could not load withdrawals."));
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
      body: JSON.stringify(action === "decline" ? { action, reason: reason || null } : { action }),
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
    <div className="mx-auto w-full max-w-md p-6">
      <button
        type="button"
        onClick={() => router.push("/admin")}
        aria-label="Back to admin dashboard"
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-5" />
      </button>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Withdrawals</h1>
      <p className="text-sm text-muted-foreground">Approve or decline payout requests.</p>

      {/* Filter chips */}
      {all && (
        <div className="mt-4 flex flex-wrap gap-2">
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

      {notice && <p className="mt-3 text-sm text-amber-600">{notice}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {!all ? (
        <div className="mt-4 grid gap-2">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {shown.map((w) => (
            <li key={w.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{w.requester?.name ?? "Unknown"}</p>
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

              <p className="mt-2 text-xs text-muted-foreground">
                {w.bank_name ?? "—"} · {w.account_number ?? "—"}
                {w.account_name ? ` · ${w.account_name}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Requested {dateLabel(w.created_at)}
                {w.decided_at ? ` · Decided ${dateLabel(w.decided_at)}` : ""}
              </p>
              {w.status === "declined" && w.reason && (
                <p className="mt-1 text-xs text-destructive/80">Reason: {w.reason}</p>
              )}

              {w.status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === w.id}
                    onClick={() => decide(w, "approve")}
                    className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {busyId === w.id ? "…" : "Accept"}
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
              )}
            </li>
          ))}
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
