"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SettingsMenu } from "@/components/app-shell/settings-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { USD_TO_NGN } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { moneyError } from "@/lib/validation";
import {
  DEFAULT_WITHDRAWAL_POLICY,
  normalizeWithdrawalPolicy,
  recurrenceLabel,
  withdrawalPolicyState,
  type WithdrawalPolicy,
  type WithdrawalPolicyMode,
  type WithdrawalRecurrence,
} from "@/lib/withdrawal-policy";

type PayoutState = {
  id: string;
  status: string; // initialized | queued | otp_required | success | failed | reversed
  failure_reason: string | null;
  amount_usd: number;
  amount_kobo: number;
  transfer_code: string | null;
  fee_charged: number | null;
  attempt: number;
  refunded: boolean;
};

type AdminWithdrawal = {
  id: string;
  amount: number; // positive (requested)
  status: "pending" | "processing" | "paid" | "failed" | "declined";
  reason: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  created_at: string;
  decided_at: string | null;
  requester: { name: string; email: string | null } | null;
  payout: PayoutState | null;
};

type Filter = "all" | "pending" | "processing" | "paid" | "failed" | "declined";
type Tab = "transactions" | "method";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const naira = (n: number) =>
  `₦${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
          {tab === "transactions" && (
            <p className="text-sm text-muted-foreground">
              Withdrawal requests. Approving sends a real Paystack transfer — 90% to
              the user, 10% commission on success.
            </p>
          )}
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
  // Approval confirmation: shows the verified name and naira amount first.
  const [confirming, setConfirming] = useState<AdminWithdrawal | null>(null);
  // OTP entry for payouts stuck at `otp_required`.
  const [otpFor, setOtpFor] = useState<AdminWithdrawal | null>(null);
  const [otp, setOtp] = useState("");

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
        action === "decline" ? { action, reason: reason || null } : { action }
      ),
    });
    setBusyId(null);
    setConfirming(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not update withdrawal");
      load();
      return;
    }
    const d = await res.json().catch(() => null);
    const updated = d?.withdrawal;
    if (d?.declined || updated?.status === "declined") {
      setNotice(
        updated?.reason === "Insufficient balance"
          ? `Request for ${money(w.amount)} was declined — the requester's balance no longer covers it.`
          : `Request for ${money(w.amount)} declined — no money moved.`
      );
    } else if (updated?.status === "processing") {
      setNotice(
        `Approved ${money(w.amount)} — transfer queued: ${naira(
          (d?.payout_usd ?? w.amount * 0.9) * USD_TO_NGN
        )} to ${w.account_name ?? "the user"}. Commission is credited when Paystack confirms.`
      );
    }
    load();
  }

  async function checkStatus(w: AdminWithdrawal) {
    if (!w.payout) return;
    setBusyId(w.id);
    setNotice(null);
    setError(null);
    const res = await fetch(`/api/payouts/${w.payout.id}/verify`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not check the transfer");
      return;
    }
    const d = await res.json().catch(() => null);
    const status = d?.settlement?.status ?? d?.payout?.status;
    if (status === "success") {
      setNotice(
        `Transfer confirmed — ${money(w.payout.amount_usd)} arrived. 10% commission credited.`
      );
    } else if (status === "failed" || status === "reversed") {
      setNotice(`Transfer ${status} — the full ${money(w.amount)} was refunded to the user.`);
    } else {
      setNotice("Paystack is still processing this transfer. Check again shortly.");
    }
    load();
  }

  async function retry(w: AdminWithdrawal) {
    setBusyId(w.id);
    setNotice(null);
    setError(null);
    const res = await fetch(`/api/withdrawals/${w.id}/retry`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not retry the payout");
      load();
      return;
    }
    setNotice(`Retry queued for ${money(w.amount)} — the funds stayed held.`);
    load();
  }

  async function submitOtp() {
    if (!otpFor?.payout) return;
    setBusyId(otpFor.id);
    setNotice(null);
    setError(null);
    const res = await fetch(`/api/payouts/${otpFor.payout.id}/otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp }),
    });
    setBusyId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Paystack rejected the OTP");
      return;
    }
    setOtp("");
    setOtpFor(null);
    setNotice("OTP accepted — the transfer is on its way.");
    load();
  }

  const counts = {
    all: all?.length ?? 0,
    pending: all?.filter((w) => w.status === "pending").length ?? 0,
    processing: all?.filter((w) => w.status === "processing").length ?? 0,
    paid: all?.filter((w) => w.status === "paid").length ?? 0,
    failed: all?.filter((w) => w.status === "failed").length ?? 0,
    declined: all?.filter((w) => w.status === "declined").length ?? 0,
  };

  const shown = (all ?? []).filter((w) => filter === "all" || w.status === filter);

  const statusBadge = (w: AdminWithdrawal) => {
    if (w.status === "paid") return <Badge>Paid</Badge>;
    if (w.status === "processing") return <Badge variant="outline">Processing</Badge>;
    if (w.status === "failed") return <Badge variant="destructive">Failed</Badge>;
    if (w.status === "declined") return <Badge variant="destructive">Declined</Badge>;
    return <Badge variant="outline">Pending</Badge>;
  };

  const payoutLine = (w: AdminWithdrawal) => {
    const p = w.payout;
    if (!p) return null;
    if (p.status === "success") {
      return (
        <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 className="size-3.5 shrink-0" />
          Transfer confirmed · {money(p.amount_usd)} · fee{" "}
          {p.fee_charged == null ? "—" : `₦${p.fee_charged}`} (platform)
        </p>
      );
    }
    if (p.status === "failed" || p.status === "reversed") {
      return (
        <p className="mt-1 flex items-start gap-1 break-words text-xs text-destructive/80">
          <XCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {p.status === "reversed" ? "Reversed" : "Failed"}
            {p.failure_reason ? ` — ${p.failure_reason}` : ""}
            {p.refunded ? " · full amount refunded" : " · funds still held, retry available"}
          </span>
        </p>
      );
    }
    if (p.status === "otp_required") {
      return (
        <p className="mt-1 text-xs text-amber-600">
          Waiting for the transfer OTP from Paystack.
        </p>
      );
    }
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        Transfer queued with Paystack (attempt {p.attempt}).
      </p>
    );
  };

  return (
    <>
      {/* Filter chips */}
      {all && (
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "processing", "paid", "failed", "declined"] as Filter[]).map(
            (f) => (
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
            )
          )}
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
                </p>
                {w.account_name && (
                  <p className="break-words text-xs font-medium text-muted-foreground">
                    Verified: {w.account_name}
                  </p>
                )}
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
                {payoutLine(w)}

                {w.status === "pending" && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      disabled={busyId === w.id}
                      onClick={() => setConfirming(w)}
                      className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      Approve
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
                )}

                {w.status === "processing" && w.payout && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(w.payout.status === "queued" ||
                      w.payout.status === "initialized" ||
                      w.payout.status === "otp_required") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === w.id}
                        onClick={() => checkStatus(w)}
                        className="flex-1"
                      >
                        <RefreshCw className="size-3.5" />
                        Check status
                      </Button>
                    )}
                    {w.payout.status === "otp_required" && (
                      <Button
                        size="sm"
                        disabled={busyId === w.id}
                        onClick={() => {
                          setOtp("");
                          setOtpFor(w);
                        }}
                        className="flex-1"
                      >
                        Enter OTP
                      </Button>
                    )}
                    {w.payout.status === "failed" && !w.payout.refunded && (
                      <Button
                        size="sm"
                        disabled={busyId === w.id}
                        onClick={() => retry(w)}
                        className="flex-1"
                      >
                        <RotateCcw className="size-3.5" />
                        Retry payout
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Approval confirmation — verified name + naira amount before money moves */}
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {confirming ? money(confirming.amount * 0.9) : ""}?</DialogTitle>
            <DialogDescription>
              This fires a real Paystack transfer. Check the verified name carefully —
              it cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {confirming && (
            <div className="grid gap-2 text-sm">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Verified account name</p>
                <p className="font-medium">{confirming.account_name ?? "Not verified"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {confirming.bank_name ?? "—"} · {confirming.account_number ?? "—"}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Request amount</span>
                <span className="font-mono font-semibold">{money(confirming.amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">User receives (90%)</span>
                <span className="font-mono font-semibold text-emerald-600">
                  {money(confirming.amount * 0.9)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Bank gets (₦{USD_TO_NGN.toLocaleString("en-US")}/$)
                </span>
                <span className="font-mono font-semibold">
                  {naira(confirming.amount * 0.9 * USD_TO_NGN)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Platform commission</span>
                <span className="font-mono font-semibold">{money(confirming.amount * 0.1)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              disabled={busyId === confirming?.id}
              onClick={() => confirming && decide(confirming, "approve")}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {busyId === confirming?.id ? "Sending…" : "Approve & send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OTP finalize (only when the Paystack account still requires it) */}
      <Dialog
        open={otpFor !== null}
        onOpenChange={(open) => {
          if (!open) setOtpFor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter transfer OTP</DialogTitle>
            <DialogDescription>
              Paystack sent a one-time code to the business phone number. The transfer
              is held until it is entered.
            </DialogDescription>
          </DialogHeader>
          <Input
            inputMode="numeric"
            maxLength={8}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="e.g. 123456"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOtpFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={busyId === otpFor?.id || otp.length < 4}
              onClick={submitOtp}
            >
              Finalize transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
              </button>
            </div>
            {busyMode && <p className="mt-2 text-xs text-muted-foreground">Saving…</p>}
          </section>

          <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-sm font-semibold">Fixed amounts</p>

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
            {data.presets.length > 0 && (
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

      {/* When users may withdraw + the popup they see when they can't */}
      <WithdrawalWindowEditor />

      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Withdrawal window — when users may withdraw + the popup they see when they
// can't. Stored as JSON in app_settings (key `withdrawal_policy`). Each mode
// carries its own popup message, and scheduled/recurring modes use a date
// boundary plus a daily time window (UTC).
// ---------------------------------------------------------------------------

const WINDOW_MODES: { value: WithdrawalPolicyMode; label: string; hint: string }[] = [
  { value: "open", label: "Any time", hint: "No restriction" },
  { value: "scheduled", label: "Specific window", hint: "Dates + daily hours" },
  { value: "recurring", label: "Recurring", hint: "e.g. every Friday" },
  { value: "disabled", label: "Not allowed", hint: "Block withdrawals" },
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** ISO instant → value for a date input, read in UTC (boundary days are UTC). */
function toUtcDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** A picked calendar date (padded or not) becomes UTC midnight so days round-trip. */
function fromUtcDate(value: string): string | null {
  const m = (value ?? "").trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const fmtInstant = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** "Mar 1, 2026 → Mar 31, 2026 · 09:00–17:00 UTC" */
function scheduleSummary(policy: WithdrawalPolicy): string {
  const dates =
    policy.boundary_start && policy.boundary_end
      ? `${fmtDay(policy.boundary_start)} → ${fmtDay(policy.boundary_end)}`
      : "dates incomplete";
  return `${dates} · ${policy.day_start}–${policy.day_end} UTC`;
}

function WithdrawalWindowEditor() {
  const [policy, setPolicy] = useState<WithdrawalPolicy | null>(null);
  // Raw date strings live outside the policy so partial typing is never wiped;
  // they're parsed into UTC dates when we save and for the live summary.
  const [startDraft, setStartDraft] = useState("");
  const [endDraft, setEndDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(() => {
    fetch("/api/admin/withdrawal-policy")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d) => {
        const next = normalizeWithdrawalPolicy(d.policy ?? DEFAULT_WITHDRAWAL_POLICY);
        setPolicy(next);
        setStartDraft(toUtcDateInput(next.boundary_start));
        setEndDraft(toUtcDateInput(next.boundary_end));
      })
      .catch(() => setError("Could not load withdrawal windows."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function patch(p: Partial<WithdrawalPolicy>) {
    setPolicy((prev) => (prev ? { ...prev, ...p } : prev));
    setError(null);
    setNotice(null);
  }

  function setStartDate(value: string) {
    setStartDraft(value);
    setError(null);
    setNotice(null);
  }

  function setEndDate(value: string) {
    setEndDraft(value);
    setError(null);
    setNotice(null);
  }

  function toggleWeekday(day: number) {
    if (!policy) return;
    const set = new Set(policy.weekdays);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    patch({ weekdays: [...set].sort((a, b) => a - b) });
  }

  function patchMessage(value: string) {
    if (!policy || policy.mode === "open") return;
    const mode = policy.mode;
    setPolicy((prev) =>
      prev ? { ...prev, messages: { ...prev.messages, [mode]: value } } : prev
    );
    setError(null);
    setNotice(null);
  }

  async function save() {
    if (!policy) return;
    const payload: WithdrawalPolicy = {
      ...policy,
      boundary_start: fromUtcDate(startDraft),
      boundary_end: fromUtcDate(endDraft),
    };
    setSaving(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/withdrawal-policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not save withdrawal windows");
      return;
    }
    const d = await res.json().catch(() => null);
    const saved = normalizeWithdrawalPolicy(d?.policy ?? payload);
    setPolicy(saved);
    setStartDraft(toUtcDateInput(saved.boundary_start));
    setEndDraft(toUtcDateInput(saved.boundary_end));
    setNotice("Withdrawal window saved — users see the new rule immediately.");
  }

  if (!policy) {
    return (
      <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" />
          <p className="text-sm font-semibold">When users can withdraw</p>
        </div>
        <Skeleton className="mt-3 h-24 w-full rounded-xl" />
        {error && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={load}>
              Retry
            </Button>
          </div>
        )}
      </section>
    );
  }

  // The policy the UI previews/saves: drafts parsed into UTC boundary dates.
  const working: WithdrawalPolicy = {
    ...policy,
    boundary_start: fromUtcDate(startDraft),
    boundary_end: fromUtcDate(endDraft),
  };
  const live = withdrawalPolicyState(working, now);
  const weekly = policy.recurrence === "weekly";
  const showSchedule = policy.mode === "scheduled" || policy.mode === "recurring";
  const messageMode = policy.mode === "open" ? null : policy.mode;

  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-muted-foreground" />
        <p className="text-sm font-semibold">When users can withdraw</p>
      </div>

      {/* Mode */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {WINDOW_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => {
              patch({ mode: m.value });
              setNotice(null);
            }}
            className={
              "rounded-lg p-3 text-left ring-1 transition-colors " +
              (policy.mode === m.value
                ? "bg-primary/10 ring-primary"
                : "bg-muted/30 ring-foreground/10 hover:bg-muted/60")
            }
          >
            <p className="text-sm font-semibold">{m.label}</p>
          </button>
        ))}
      </div>

      {/* Recurring rules */}
      {policy.mode === "recurring" && (
        <div className="mt-3 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="wp-rec">Repeats</Label>
              <Select
                value={policy.recurrence}
                onValueChange={(v) => patch({ recurrence: v as WithdrawalRecurrence })}
                items={[
                  { value: "weekly", label: "Weekly" },
                  { value: "monthly", label: "Monthly" },
                ]}
              >
                <SelectTrigger id="wp-rec" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wp-interval">Every</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="wp-interval"
                  inputMode="numeric"
                  value={String(policy.interval)}
                  onChange={(e) =>
                    patch({
                      interval: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1),
                    })
                  }
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {weekly ? "week(s)" : "month(s)"}
                </span>
              </div>
            </div>
          </div>

          {weekly ? (
            <div className="grid gap-1.5">
              <Label>Days</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    className={
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                      (policy.weekdays.includes(day)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/40 text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="wp-monthday">Day of month</Label>
              <Input
                id="wp-monthday"
                inputMode="numeric"
                placeholder="1–31"
                value={policy.month_days[0] ? String(policy.month_days[0]) : ""}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, "").slice(0, 2));
                  patch({ month_days: n >= 1 && n <= 31 ? [n] : [] });
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Date boundary + daily time window (scheduled + recurring) */}
      {showSchedule && (
        <div className="mt-3 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="wp-bound-start">Start date</Label>
              <Input
                id="wp-bound-start"
                type="date"
                value={startDraft}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wp-bound-end">End date</Label>
              <Input
                id="wp-bound-end"
                type="date"
                value={endDraft}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="wp-day-start">Opens at</Label>
              <Input
                id="wp-day-start"
                type="time"
                value={policy.day_start}
                onChange={(e) => patch({ day_start: e.target.value || "00:00" })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wp-day-end">Closes at</Label>
              <Input
                id="wp-day-end"
                type="time"
                value={policy.day_end}
                onChange={(e) => patch({ day_end: e.target.value || "23:59" })}
              />
            </div>
          </div>
        </div>
      )}

      {/* Per-mode popup message */}
      {messageMode && (
        <div className="mt-3 grid gap-1.5">
          <Label htmlFor="wp-message">Popup message</Label>
          <Textarea
            id="wp-message"
            rows={3}
            maxLength={500}
            value={policy.messages[messageMode]}
            onChange={(e) => patchMessage(e.target.value)}
            placeholder="Tell users why withdrawals are closed."
          />
        </div>
      )}

      {/* Live summary */}
      <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        {policy.mode === "open" && <p>Withdrawals are open any time.</p>}
        {policy.mode === "disabled" && <p>Withdrawals are blocked entirely.</p>}
        {policy.mode === "scheduled" && (
          <p>
            {scheduleSummary(working)}.{" "}
            {live.open
              ? "Open now."
              : live.next_open
                ? `Closed — opens ${fmtInstant(live.next_open)}.`
                : "Closed — the window has passed."}
          </p>
        )}
        {policy.mode === "recurring" && (
          <p>
            {recurrenceLabel(working)} · {scheduleSummary(working)}.{" "}
            {live.open
              ? "Open now."
              : live.next_open
                ? `Next opens ${fmtInstant(live.next_open)}.`
                : "No upcoming opening."}
          </p>
        )}
      </div>

      {notice && <p className="mt-2 text-xs text-emerald-600">{notice}</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <Button onClick={save} disabled={saving} className="mt-3 w-full">
        {saving ? "Saving…" : "Save withdrawal window"}
      </Button>
    </section>
  );
}
