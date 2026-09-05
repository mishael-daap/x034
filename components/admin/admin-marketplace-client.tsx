"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsMenu } from "@/components/app-shell/settings-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AdminJob = {
  id: string;
  company_id: string | null;
  company: string;
  tier_id: string | null;
  tier: string;
  tier_name: string;
  total_payout: number;
  duration_hours: number;
  starts_at: string;
  required_referrals: number;
  status: string;
};

type Option = { id: string; name: string };
type TierOption = { id: string; code: string; name: string };

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "2025-01-02T10:30:00Z" → "2025-01-02T10:30" (local, for datetime-local input) */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type FormState = {
  company_id: string;
  tier_id: string;
  total_payout: string;
  duration_hours: string;
  required_referrals: string;
  starts_at: string;
};

const emptyForm = (): FormState => {
  const d = new Date(Date.now() + 24 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    company_id: "",
    tier_id: "",
    total_payout: "20.00",
    duration_hours: "6",
    required_referrals: "0",
    starts_at: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};

const STATUS_BADGE: Record<string, "default" | "outline" | "secondary"> = {
  open: "default",
  locked: "secondary",
  completed: "outline",
  cancelled: "outline",
};

export function AdminMarketplaceClient() {
  const [jobs, setJobs] = useState<AdminJob[] | null>(null);
  const [companies, setCompanies] = useState<Option[]>([]);
  const [tiers, setTiers] = useState<TierOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ job: AdminJob | null; form: FormState } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminJob | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/admin/jobs").then((r) => (r.ok ? r.json() : { jobs: [] })),
      fetch("/api/companies").then((r) => (r.ok ? r.json() : { companies: [] })),
      fetch("/api/admin/node-tiers").then((r) => (r.ok ? r.json() : { tiers: [] })),
    ])
      .then(([j, c, t]) => {
        setJobs(j.jobs ?? []);
        setCompanies(c.companies ?? []);
        setTiers(t.tiers ?? []);
      })
      .catch(() => setError("Could not load marketplace."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setError(null);
    setEditor({ job: null, form: emptyForm() });
  }

  function openEdit(job: AdminJob) {
    setError(null);
    setEditor({
      job,
      form: {
        company_id: job.company_id ?? "",
        tier_id: job.tier_id ?? "",
        total_payout: String(job.total_payout),
        duration_hours: String(job.duration_hours),
        required_referrals: String(job.required_referrals),
        starts_at: toLocalInput(job.starts_at),
      },
    });
  }

  async function handleSave() {
    if (!editor) return;
    setSaving(true);
    setError(null);
    const job = editor.job;
    const isEdit = job !== null;
    const url = isEdit ? `/api/admin/jobs/${job.id}` : "/api/admin/jobs";
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: editor.form.company_id,
        tier_id: editor.form.tier_id,
        total_payout: Number(editor.form.total_payout),
        duration_hours: Number(editor.form.duration_hours),
        required_referrals: Number(editor.form.required_referrals),
        starts_at: editor.form.starts_at,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not save job");
      return;
    }
    setEditor(null);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyDelete(true);
    setError(null);
    const res = await fetch(`/api/admin/jobs/${deleteTarget.id}`, { method: "DELETE" });
    setBusyDelete(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not remove job");
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    load();
  }

  return (
    <div className="mx-auto w-full max-w-md p-4 pb-10">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
          <p className="text-sm text-muted-foreground">
            All jobs — create, edit and remove. Changes reflect for users instantly.
          </p>
        </div>
        <SettingsMenu />
      </header>

      <Button onClick={openCreate} className="mb-4 w-full">
        <Plus />
        Create job
      </Button>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {!jobs ? (
        <div className="grid gap-2">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No jobs yet. Create the first one.</p>
      ) : (
        <div className="grid gap-3">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{job.company}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Tier {job.tier} · {job.tier_name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-base font-bold tabular-nums">
                    {money(job.total_payout)}
                  </p>
                  <Badge variant={STATUS_BADGE[job.status] ?? "outline"} className="mt-1 capitalize">
                    {job.status}
                  </Badge>
                </div>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                {job.duration_hours}h · {job.required_referrals} referral
                {job.required_referrals === 1 ? "" : "s"} required · starts{" "}
                {new Date(job.starts_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>

              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={job.status !== "open"}
                  onClick={() => openEdit(job)}
                  className="flex-1"
                >
                  <Pencil />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDeleteTarget(job)}
                  className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 />
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editor?.job ? "Edit job" : "Create job"}</DialogTitle>
            <DialogDescription>
              {editor?.job
                ? "Editing is only possible before the job starts."
                : "Users see new jobs in their marketplace immediately."}
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="aj-company">Company</Label>
                <Select
                  value={editor.form.company_id || null}
                  onValueChange={(v) =>
                    setEditor({ ...editor, form: { ...editor.form, company_id: v as string } })
                  }
                >
                  <SelectTrigger id="aj-company" className="w-full">
                    <SelectValue placeholder="Select a company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="aj-tier">Minimum node option</Label>
                <Select
                  value={editor.form.tier_id || null}
                  onValueChange={(v) =>
                    setEditor({ ...editor, form: { ...editor.form, tier_id: v as string } })
                  }
                >
                  <SelectTrigger id="aj-tier" className="w-full">
                    <SelectValue placeholder="Select a node option" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        Tier {t.code} · {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="aj-payout">Payout pot ($)</Label>
                  <Input
                    id="aj-payout"
                    type="number"
                    min="0.1"
                    step="0.01"
                    value={editor.form.total_payout}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        form: { ...editor.form, total_payout: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="aj-hours">Duration (h)</Label>
                  <Input
                    id="aj-hours"
                    type="number"
                    min="0.1"
                    step="0.5"
                    value={editor.form.duration_hours}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        form: { ...editor.form, duration_hours: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="aj-refs">Referrals required</Label>
                  <Input
                    id="aj-refs"
                    type="number"
                    min="0"
                    step="1"
                    value={editor.form.required_referrals}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        form: { ...editor.form, required_referrals: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="aj-start">Starts at</Label>
                  <Input
                    id="aj-start"
                    type="datetime-local"
                    value={editor.form.starts_at}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        form: { ...editor.form, starts_at: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <CalendarPlus />
              {saving ? "Saving…" : editor?.job ? "Save changes" : "Create job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove job</DialogTitle>
            <DialogDescription>
              {deleteTarget ? (
                <>
                  Remove the <strong>{deleteTarget.company}</strong> job worth{" "}
                  {money(deleteTarget.total_payout)}? This cannot be undone.
                </>
              ) : (
                ""
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busyDelete}
              onClick={handleDelete}
            >
              <Trash2 />
              {busyDelete ? "Removing…" : "Remove job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
