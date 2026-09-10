"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CalendarPlus, Check, Pencil, Plus, Trash2, X } from "lucide-react";
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
import { FieldError } from "@/components/ui/field-error";
import {
  decimalError,
  requiredSelectError,
  shortLabelError,
  startsAtError,
  wholeNumberError,
} from "@/lib/validation";

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
  actual_duration_hours: number | null;
  pool_count: number;
  max_pool: number;
};

const COMMIT_WINDOW_MS = 3_600_000; // matches COMMIT_WINDOW_HOURS = 1

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
  company: string;
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
    company: "",
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

type JobErrors = Partial<
  Record<
    | "company"
    | "tier_id"
    | "total_payout"
    | "duration_hours"
    | "required_referrals"
    | "starts_at",
    string
  >
>;

type AdminCompany = { id: string; name: string; jobs_count: number };

export function AdminMarketplaceClient() {
  const [jobs, setJobs] = useState<AdminJob[] | null>(null);
  const [companies, setCompanies] = useState<Option[]>([]);
  const [tiers, setTiers] = useState<TierOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<JobErrors>({});
  const [editor, setEditor] = useState<{
    job: AdminJob | null;
    form: FormState;
    reuse?: boolean;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminJob | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const [busyLifecycle, setBusyLifecycle] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Predefined company names (edited in the Manage companies dialog).
  const [companiesOpen, setCompaniesOpen] = useState(false);
  const [managed, setManaged] = useState<AdminCompany[] | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [companyBusy, setCompanyBusy] = useState<string | null>(null);
  const [newCompany, setNewCompany] = useState("");
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [companyNameDraft, setCompanyNameDraft] = useState("");

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
        company: job.company,
        tier_id: job.tier_id ?? "",
        total_payout: String(job.total_payout),
        duration_hours: String(job.duration_hours),
        required_referrals: String(job.required_referrals),
        starts_at: toLocalInput(job.starts_at),
      },
    });
  }

  // Reuse a finished job: open the create form prefilled and scheduled afresh.
  function openReuse(job: AdminJob) {
    setError(null);
    const d = new Date(Date.now() + 24 * 3_600_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    setEditor({
      job: null,
      reuse: true,
      form: {
        company: job.company,
        tier_id: job.tier_id ?? "",
        total_payout: String(job.total_payout),
        duration_hours: String(job.duration_hours),
        required_referrals: String(job.required_referrals),
        starts_at: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
      },
    });
  }

  async function handleSave() {
    if (!editor) return;

    const f = editor.form;
    // Finished jobs keep their historical start; only live/create jobs need a
    // future start.
    const finished =
      editor.job?.status === "completed" || editor.job?.status === "cancelled";
    const startErr = finished
      ? !f.starts_at.trim()
        ? "Pick a start time"
        : Number.isNaN(Date.parse(f.starts_at))
          ? "Pick a valid date and time"
          : null
      : startsAtError(f.starts_at);
    const next: JobErrors = {
      company: shortLabelError(f.company, "Company") ?? undefined,
      tier_id: requiredSelectError("a node option", f.tier_id) ?? undefined,
      total_payout: decimalError(f.total_payout, {
        label: "Payout pot",
        min: 0.1,
        max: 1_000_000,
      }) ?? undefined,
      duration_hours: decimalError(f.duration_hours, {
        label: "Duration",
        min: 0.1,
        max: 24 * 30,
      }) ?? undefined,
      required_referrals: wholeNumberError(f.required_referrals, {
        label: "Referrals required",
        min: 0,
        max: 1_000_000,
      }) ?? undefined,
      starts_at: startErr ?? undefined,
    };
    setFormErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setFormErrors({});

    setSaving(true);
    setError(null);
    const job = editor.job;
    const isEdit = job !== null;
    const url = isEdit ? `/api/admin/jobs/${job.id}` : "/api/admin/jobs";
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name: editor.form.company.trim(),
        tier_id: editor.form.tier_id,
        total_payout: Number(editor.form.total_payout),
        duration_hours: Number(editor.form.duration_hours),
        required_referrals: Number(editor.form.required_referrals),
        // datetime-local gives a local wall-clock value with no offset; convert
        // it here (browser local time) so the server never misreads it as UTC
        // and shifts the job an hour (or more) later than the admin set.
        starts_at: new Date(editor.form.starts_at).toISOString(),
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
    if (companiesOpen) loadManagedCompanies();
  }

  // ── Company management ────────────────────────────────────────────────────
  const loadManagedCompanies = useCallback(() => {
    fetch("/api/admin/companies")
      .then((r) => (r.ok ? r.json() : { companies: [] }))
      .then((d) => setManaged(d.companies ?? []))
      .catch(() => setManaged([]));
  }, []);

  function openCompanies() {
    setCompanyError(null);
    setEditingCompanyId(null);
    setNewCompany("");
    setCompaniesOpen(true);
    loadManagedCompanies();
  }

  async function addCompany() {
    const name = newCompany.trim();
    if (!name || companyBusy) return;
    setCompanyBusy("add");
    setCompanyError(null);
    const res = await fetch("/api/admin/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCompanyBusy(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setCompanyError(d?.error ?? "Could not add company");
      return;
    }
    setNewCompany("");
    loadManagedCompanies();
    load();
  }

  async function renameCompany(id: string) {
    const name = companyNameDraft.trim();
    if (!name || companyBusy) return;
    setCompanyBusy(id);
    setCompanyError(null);
    const res = await fetch(`/api/admin/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCompanyBusy(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setCompanyError(d?.error ?? "Could not rename company");
      return;
    }
    setEditingCompanyId(null);
    setCompanyNameDraft("");
    loadManagedCompanies();
    load();
  }

  async function removeCompany(id: string) {
    if (companyBusy) return;
    setCompanyBusy(id);
    setCompanyError(null);
    const res = await fetch(`/api/admin/companies/${id}`, { method: "DELETE" });
    setCompanyBusy(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setCompanyError(d?.error ?? "Could not remove company");
      return;
    }
    loadManagedCompanies();
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

  // Admin lifecycle shortcuts: start/lock a job now, or reopen it for commits.
  async function handleLifecycle(job: AdminJob, action: "lock" | "open") {
    setBusyLifecycle(job.id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusyLifecycle(null);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not update job");
      return;
    }
    setNotice(
      action === "lock"
        ? `"${job.company}" locked — job started now.`
        : `"${job.company}" reopened — open for commits again (starts in 3h).`
    );
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

      <div className="mb-4 flex gap-2">
        <Button onClick={openCreate} className="flex-1">
          <Plus />
          Create job
        </Button>
        <Button variant="outline" onClick={openCompanies}>
          <Building2 />
          Companies
        </Button>
      </div>

      {notice && <p className="mb-3 text-sm text-emerald-600">{notice}</p>}
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
                {job.duration_hours}h · {job.pool_count}/{job.max_pool} node
                {job.max_pool === 1 ? "" : "s"} in pool · {job.required_referrals} referral
                {job.required_referrals === 1 ? "" : "s"} required · starts{" "}
                {new Date(job.starts_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>

              {/* Lock / reopen lifecycle controls (only on jobs whose earnings
                  haven't been locked yet — status open & no realized duration). */}
              {(() => {
                const live = job.status === "open" && job.actual_duration_hours == null;
                if (!live) return null; // earnings already booked — no lifecycle control
                const start = new Date(job.starts_at).getTime();
                const canReopen = Date.now() >= start - COMMIT_WINDOW_MS;
                return (
                  <div className="mt-3 grid gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyLifecycle === job.id}
                      onClick={() => handleLifecycle(job, "lock")}
                    >
                      {busyLifecycle === job.id ? "Updating…" : "Lock now (start the job)"}
                    </Button>
                    {canReopen && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyLifecycle === job.id}
                        onClick={() => handleLifecycle(job, "open")}
                      >
                        Reopen for commits
                      </Button>
                    )}
                  </div>
                );
              })()}

              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    job.status !== "open" &&
                    job.status !== "completed" &&
                    job.status !== "cancelled"
                  }
                  onClick={() => openEdit(job)}
                  className="flex-1"
                >
                  <Pencil />
                  Edit
                </Button>
                {job.status === "completed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openReuse(job)}
                    className="flex-1"
                  >
                    <CalendarPlus />
                    Reuse
                  </Button>
                )}
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
            <DialogTitle>
              {editor?.reuse ? "Reuse job" : editor?.job ? "Edit job" : "Create job"}
            </DialogTitle>
            <DialogDescription>
              {editor?.reuse
                ? "Creates a fresh, open copy of the finished job. The original stays in your history."
                : editor?.job
                  ? "Edits apply to this job. Finished jobs can still be edited here."
                  : "Type a company name — new ones are saved to your list. Users see new jobs immediately."}
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="aj-company">Company</Label>
                <Input
                  id="aj-company"
                  list="aj-company-options"
                  value={editor.form.company}
                  placeholder="Type or pick a company"
                  autoComplete="off"
                  onChange={(e) => {
                    setEditor((prev) =>
                      prev ? { ...prev, form: { ...prev.form, company: e.target.value } } : prev
                    );
                    setFormErrors({});
                  }}
                />
                <datalist id="aj-company-options">
                  {companies.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
                <FieldError message={formErrors.company} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="aj-tier">Minimum node option</Label>
                <Select
                  value={editor.form.tier_id || null}
                  onValueChange={(v) => {
                    setEditor((prev) =>
                      prev ? { ...prev, form: { ...prev.form, tier_id: v as string } } : prev
                    );
                    setFormErrors({});
                  }}
                  items={tiers.map((t) => ({
                    value: t.id,
                    label: `Tier ${t.code} · ${t.name}`,
                  }))}
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
                <FieldError message={formErrors.tier_id} />
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
                      onChange={(e) => {
                        setEditor((prev) =>
                          prev
                            ? { ...prev, form: { ...prev.form, total_payout: e.target.value } }
                            : prev
                        );
                        setFormErrors({});
                      }}
                    />
                    <FieldError message={formErrors.total_payout} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="aj-hours">Duration (h)</Label>
                    <Input
                      id="aj-hours"
                      type="number"
                      min="0.1"
                      step="0.5"
                      value={editor.form.duration_hours}
                      onChange={(e) => {
                        setEditor((prev) =>
                          prev
                            ? { ...prev, form: { ...prev.form, duration_hours: e.target.value } }
                            : prev
                        );
                        setFormErrors({});
                      }}
                    />
                    <FieldError message={formErrors.duration_hours} />
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
                    onChange={(e) => {
                      setEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              form: { ...prev.form, required_referrals: e.target.value },
                            }
                          : prev
                      );
                      setFormErrors({});
                    }}
                  />
                  <FieldError message={formErrors.required_referrals} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="aj-start">Starts at</Label>
                  <Input
                    id="aj-start"
                    type="datetime-local"
                    value={editor.form.starts_at}
                    onChange={(e) => {
                      setEditor((prev) =>
                        prev ? { ...prev, form: { ...prev.form, starts_at: e.target.value } } : prev
                      );
                      setFormErrors({});
                    }}
                  />
                  <FieldError message={formErrors.starts_at} />
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
              {saving
                ? "Saving…"
                : editor?.job
                  ? "Save changes"
                  : editor?.reuse
                    ? "Reuse job"
                    : "Create job"}
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

      {/* Manage predefined companies */}
      <Dialog
        open={companiesOpen}
        onOpenChange={(open) => {
          if (!open) setCompaniesOpen(false);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-4" />
              Companies
            </DialogTitle>
            <DialogDescription>
              Names offered when creating a job. Renaming updates every job that uses it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-end gap-2">
            <div className="grid min-w-0 flex-1 gap-1.5">
              <Label htmlFor="company-add">New company</Label>
              <Input
                id="company-add"
                value={newCompany}
                maxLength={40}
                placeholder="e.g. Northwind AI"
                onChange={(e) => {
                  setNewCompany(e.target.value);
                  setCompanyError(null);
                }}
              />
            </div>
            <Button
              size="sm"
              onClick={addCompany}
              disabled={companyBusy === "add" || !newCompany.trim()}
              className="mb-0.5"
            >
              <Plus />
              Add
            </Button>
          </div>

          {managed === null ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : managed.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No companies yet — add one above.
            </p>
          ) : (
            <ul className="grid gap-2">
              {managed.map((c) => {
                const editing = editingCompanyId === c.id;
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"
                  >
                    {editing ? (
                      <>
                        <Input
                          value={companyNameDraft}
                          autoFocus
                          maxLength={40}
                          onChange={(e) => {
                            setCompanyNameDraft(e.target.value);
                            setCompanyError(null);
                          }}
                          className="h-8 min-w-0 flex-1"
                        />
                        <div className="flex shrink-0 gap-1.5">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Cancel"
                            onClick={() => {
                              setEditingCompanyId(null);
                              setCompanyNameDraft("");
                            }}
                          >
                            <X className="size-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            aria-label="Save"
                            disabled={companyBusy === c.id}
                            onClick={() => renameCompany(c.id)}
                          >
                            <Check className="size-4" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.jobs_count} job{c.jobs_count === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Rename company"
                            onClick={() => {
                              setEditingCompanyId(c.id);
                              setCompanyNameDraft(c.name);
                              setCompanyError(null);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Remove company"
                            disabled={companyBusy === c.id}
                            onClick={() => removeCompany(c.id)}
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

          {companyError && <p className="text-sm text-destructive">{companyError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompaniesOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
