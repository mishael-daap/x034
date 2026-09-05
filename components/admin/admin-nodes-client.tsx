"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu, MemoryStick, Network, Pencil, Plus, Trash2 } from "lucide-react";
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

type Tier = {
  id: string;
  code: string;
  name: string;
  vcpu: number;
  ram_gb: number;
  gpu: number;
  bandwidth: number;
  price: number;
};

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type FormState = {
  code: string;
  name: string;
  vcpu: string;
  ram_gb: string;
  gpu: string;
  bandwidth: string;
  price: string;
};

const emptyForm = (): FormState => ({
  code: "",
  name: "",
  vcpu: "4",
  ram_gb: "16",
  gpu: "1",
  bandwidth: "1",
  price: "10.00",
});

export function AdminNodesClient() {
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ tier: Tier | null; form: FormState } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tier | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/node-tiers")
      .then((r) => (r.ok ? r.json() : { tiers: [] }))
      .then((d) => setTiers(d.tiers ?? []))
      .catch(() => setError("Could not load node options."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setError(null);
    setEditor({ tier: null, form: emptyForm() });
  }

  function openEdit(t: Tier) {
    setError(null);
    setEditor({
      tier: t,
      form: {
        code: t.code,
        name: t.name,
        vcpu: String(t.vcpu),
        ram_gb: String(t.ram_gb),
        gpu: String(t.gpu),
        bandwidth: String(t.bandwidth),
        price: String(t.price),
      },
    });
  }

  async function handleSave() {
    if (!editor) return;
    setSaving(true);
    setError(null);
    const tier = editor.tier;
    const isEdit = tier !== null;
    const url = isEdit ? `/api/admin/node-tiers/${tier.id}` : "/api/admin/node-tiers";
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: editor.form.code,
        name: editor.form.name,
        vcpu: Number(editor.form.vcpu),
        ram_gb: Number(editor.form.ram_gb),
        gpu: Number(editor.form.gpu),
        bandwidth: Number(editor.form.bandwidth),
        price: Number(editor.form.price),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not save node option");
      return;
    }
    setEditor(null);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyDelete(true);
    setError(null);
    const res = await fetch(`/api/admin/node-tiers/${deleteTarget.id}`, { method: "DELETE" });
    setBusyDelete(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not remove node option");
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
          <h1 className="text-2xl font-semibold tracking-tight">Nodes</h1>
          <p className="text-sm text-muted-foreground">
            Node options users can buy — create, edit and remove. Changes show up
            instantly on the user purchase page.
          </p>
        </div>
        <SettingsMenu />
      </header>

      <Button onClick={openCreate} className="mb-4 w-full">
        <Plus />
        Create node option
      </Button>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {!tiers ? (
        <div className="grid gap-2">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : tiers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No node options yet. Create the first one.
        </p>
      ) : (
        <div className="grid gap-3">
          {tiers.map((t) => (
            <div key={t.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold tracking-tight">
                    Tier {t.code} · {t.name}
                  </p>
                  <p className="font-mono text-sm font-bold tabular-nums text-primary">
                    {money(t.price)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                    <Pencil />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteTarget(t)}
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>

              <ul className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Cpu className="size-3.5 shrink-0" />
                  {t.vcpu} vCPU
                </li>
                <li className="flex items-center gap-2">
                  <MemoryStick className="size-3.5 shrink-0" />
                  {t.ram_gb} GB
                </li>
                <li className="flex items-center gap-2">
                  <Network className="size-3.5 shrink-0" />
                  {t.bandwidth} Gbps
                </li>
                <li className="flex items-center gap-2">GPU ×{t.gpu}</li>
              </ul>
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
            <DialogTitle>{editor?.tier ? "Edit node option" : "Create node option"}</DialogTitle>
            <DialogDescription>
              Set the code, specs and USD price users pay from their wallet.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="nt-code">Code</Label>
                  <Input
                    id="nt-code"
                    value={editor.form.code}
                    onChange={(e) =>
                      setEditor({ ...editor, form: { ...editor.form, code: e.target.value } })
                    }
                    placeholder="e.g. D"
                    maxLength={8}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="nt-name">Name</Label>
                  <Input
                    id="nt-name"
                    value={editor.form.name}
                    onChange={(e) =>
                      setEditor({ ...editor, form: { ...editor.form, name: e.target.value } })
                    }
                    placeholder="e.g. Ultimate"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="nt-vcpu">vCPU</Label>
                  <Input
                    id="nt-vcpu"
                    type="number"
                    min="0"
                    step="1"
                    value={editor.form.vcpu}
                    onChange={(e) =>
                      setEditor({ ...editor, form: { ...editor.form, vcpu: e.target.value } })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="nt-ram">RAM (GB)</Label>
                  <Input
                    id="nt-ram"
                    type="number"
                    min="0"
                    step="1"
                    value={editor.form.ram_gb}
                    onChange={(e) =>
                      setEditor({ ...editor, form: { ...editor.form, ram_gb: e.target.value } })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="nt-gpu">GPU</Label>
                  <Input
                    id="nt-gpu"
                    type="number"
                    min="0"
                    step="1"
                    value={editor.form.gpu}
                    onChange={(e) =>
                      setEditor({ ...editor, form: { ...editor.form, gpu: e.target.value } })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="nt-bw">Gbps</Label>
                  <Input
                    id="nt-bw"
                    type="number"
                    min="0"
                    step="1"
                    value={editor.form.bandwidth}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        form: { ...editor.form, bandwidth: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="nt-price">Price ($)</Label>
                  <Input
                    id="nt-price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editor.form.price}
                    onChange={(e) =>
                      setEditor({ ...editor, form: { ...editor.form, price: e.target.value } })
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
              {saving ? "Saving…" : editor?.tier ? "Save changes" : "Create option"}
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
            <DialogTitle>Remove node option</DialogTitle>
            <DialogDescription>
              {deleteTarget ? (
                <>
                  Remove <strong>Tier {deleteTarget.code} · {deleteTarget.name}</strong>? Options
                  that are already owned or used by jobs cannot be removed.
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
            <Button variant="destructive" disabled={busyDelete} onClick={handleDelete}>
              <Trash2 />
              {busyDelete ? "Removing…" : "Remove option"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
