"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsMenu } from "@/components/app-shell/settings-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { moneyError } from "@/lib/validation";

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
type Tab = "transactions" | "method";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** Admin entry point: withdrawal review queue + how users withdraw (Method). */
export function AdminTransactionsClient() {
  const [tab, setTab] = useState<Tab>("transactions");

  return (
    <div className="mx-auto w-full max-w-md p-4 pb-10">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {tab === "transactions"
              ? "Withdrawal requests from all users. Approve to pay out 90% — 10% commission stays with the platform."
              : "Choose how users pick an amount to withdraw. Only one method shows on the user's page."}
          </p>
        </div>
        <SettingsMenu />
      </header>

      {/* Transactions | Method */}
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-card p-1 ring-1 ring-foreground/10">
        {(
          [
            { value: "transactions", label: "Transactions" },
            { value: "method", label: "Method" },
          ] as { value: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={
              "rounded-lg py-2 text-sm font-semibold transition-colors " +
              (tab === t.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "transactions" ? <TransactionsQueue /> : <WithdrawMethodPanel />}
    </div>
  );
}

function TransactionsQueue() {
  const [all, setAll] = useState<AdminWithdrawal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
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
    if (updated?.status === "declined") {
      setNotice(
        updated?.reason === "Insufficient balance"
          ? `Request for ${money(w.amount)} was declined — the requester's balance no longer covers it.`
          : `Request for ${money(w.amount)} declined — no money moved.`
      );
    }
    if (updated?.status === "approved") {
      setNotice(
        d?.payout != null && (modes[w.id] ?? "simulated") === "paystack"
          ? `Approved ${money(w.amount)} — ${money(d.payout)} paid via Paystack, 10% commission kept.`
          : `Approved ${money(w.amount)} (${modes[w.id] ?? "simulated"} payout).`
      );
    }
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
    <>
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

                <p className="mt-2 break-words text-xs text-muted-foreground">
                  {w.bank_name ?? "—"} · {w.account_number ?? "—"}
                  {w.account_name ? ` · ${w.account_name}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Requested {dateLabel(w.created_at)}
                  {w.decided_at ? ` · Decided ${dateLabel(w.decided_at)}` : ""}
                </p>
                {w.status === "declined" && w.reason && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive/80">
                    <XCircle className="size-3.5 shrink-0" />
                    <span className="break-words">{w.reason}</span>
                  </p>
                )}
                {w.status === "approved" && w.reason && (
                  <p className="mt-1 flex items-center gap-1 break-words text-xs text-muted-foreground">
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
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
                      items={[
                        { value: "simulated", label: "Simulated payout (test)" },
                        { value: "paystack", label: "Real payout via Paystack" },
                      ]}
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
                        onClick={() => decide(w, "decline")}
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Withdrawal method — how users pick an amount (admin decides, user sees one)
// ---------------------------------------------------------------------------

type PresetItem = { id: string; amount: number };
type MethodData = { mode: "input" | "presets"; presets: PresetItem[] };

function WithdrawMethodPanel() {
  const [data, setData] = useState<MethodData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyMode, setBusyMode] = useState(false);
  // Add / edit / remove preset buttons.
  const [addVal, setAddVal] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/withdraw-method")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d) => setData({ mode: d.mode === "presets" ? "presets" : "input", presets: d.presets ?? [] }))
      .catch(() => setError("Could not load withdrawal settings."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setMode(mode: "input" | "presets") {
    if (!data || data.mode === mode || busyMode) return;
    setBusyMode(true);
    setNotice(null);
    setError(null);
    const res = await fetch("/api/admin/withdraw-method", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    setBusyMode(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not save the withdrawal method");
      return;
    }
    setData((prev) => (prev ? { ...prev, mode } : prev));
    setNotice(
      mode === "presets"
        ? "Users now see fixed-amount buttons on their Withdraw page."
        : "Users now see the free amount input on their Withdraw page."
    );
  }

  const addErr = addVal.trim() ? moneyError(addVal, { label: "Amount" }) : null;

  async function addPreset() {
    const amount = Number(addVal);
    if (!addVal.trim() || addErr || adding || !Number.isFinite(amount) || amount <= 0) return;
    setAdding(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/withdraw-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    setAdding(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not add amount");
      return;
    }
    setAddVal("");
    load();
  }

  async function saveEdit(id: string) {
    const amount = Number(editVal);
    const err = editVal.trim() ? moneyError(editVal, { label: "Amount" }) : "Enter an amount";
    if (err || !Number.isFinite(amount) || amount <= 0) {
      setError(typeof err === "string" ? err : "Enter a valid amount");
      return;
    }
    setSavingEdit(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/withdraw-presets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    setSavingEdit(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not update amount");
      return;
    }
    setEditingId(null);
    setEditVal("");
    load();
  }

  async function removePreset(id: string) {
    if (removingId) return;
    setRemovingId(id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/withdraw-presets/${id}`, { method: "DELETE" });
    setRemovingId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not remove amount");
      return;
    }
    load();
  }

  return (
    <div className="grid gap-4">
      {!data ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <>
          <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-sm font-semibold">How users withdraw</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Exactly one method appears on the user&apos;s Withdraw page.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("presets")}
                disabled={busyMode}
                className={
                  "rounded-lg p-3 text-left ring-1 transition-colors " +
                  (data.mode === "presets"
                    ? "bg-primary/10 ring-primary"
                    : "bg-muted/30 ring-foreground/10 hover:bg-muted/60")
                }
              >
                <p className="text-sm font-semibold">Amount buttons</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Fixed amounts you set below
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode("input")}
                disabled={busyMode}
                className={
                  "rounded-lg p-3 text-left ring-1 transition-colors " +
                  (data.mode === "input"
                    ? "bg-primary/10 ring-primary"
                    : "bg-muted/30 ring-foreground/10 hover:bg-muted/60")
                }
              >
                <p className="text-sm font-semibold">Free amount</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Users type any amount (as now)
                </p>
              </button>
            </div>
            {busyMode && <p className="mt-2 text-xs text-muted-foreground">Saving…</p>}
          </section>

          <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-sm font-semibold">Fixed amounts</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data.mode === "presets"
                ? "These buttons are what users tap to withdraw."
                : "Curate these now — they show as buttons when Amount buttons is selected."}
            </p>

            {/* Add */}
            <div className="mt-3 flex items-end gap-2">
              <div className="grid min-w-0 flex-1 gap-1.5">
                <Label htmlFor="preset-add">Add amount ($)</Label>
                <Input
                  id="preset-add"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="25.00"
                  value={addVal}
                  onChange={(e) => {
                    setAddVal(e.target.value);
                    setError(null);
                    setNotice(null);
                  }}
                />
              </div>
              <Button size="sm" onClick={addPreset} disabled={!!addErr || adding} className="mb-0.5">
                <Plus />
                Add
              </Button>
            </div>
            {addErr && <p className="mt-1 text-xs text-destructive">{addErr}</p>}

            {/* List */}
            {data.presets.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No fixed amounts yet — add your first one above.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {data.presets.map((p) => {
                  const editing = editingId === p.id;
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"
                    >
                      {editing ? (
                        <>
                          <Input
                            inputMode="decimal"
                            value={editVal}
                            autoFocus
                            onChange={(e) => {
                              setEditVal(e.target.value);
                              setError(null);
                            }}
                            className="h-8 w-28"
                          />
                          <div className="flex shrink-0 gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={savingEdit}
                              onClick={() => {
                                setEditingId(null);
                                setEditVal("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button size="sm" disabled={savingEdit} onClick={() => saveEdit(p.id)}>
                              {savingEdit ? "…" : "Save"}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="font-[var(--font-roboto-mono)] text-base font-bold tabular-nums">
                            {money(p.amount)}
                          </p>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Edit amount"
                              onClick={() => {
                                setEditingId(p.id);
                                setEditVal(String(p.amount));
                                setError(null);
                              }}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Remove amount"
                              disabled={removingId === p.id}
                              onClick={() => removePreset(p.id)}
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
