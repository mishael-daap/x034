import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { decimalError, nodeCodeError, shortLabelError, wholeNumberError } from "@/lib/validation";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type CountRow = { count: number };

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/admin/node-tiers/[id] — edit a node option (admin only). */
export async function PATCH(req: Request, { params }: Params) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const updates: Record<string, unknown> = {};
  const str = (v: unknown) => (v == null ? "" : String(v));

  if ("code" in body) {
    const err = nodeCodeError(str(body.code));
    if (err) return json(400, { error: err });
    updates.code = str(body.code).trim().toUpperCase();
  }
  if ("name" in body) {
    const err = shortLabelError(str(body.name), "Name");
    if (err) return json(400, { error: err });
    updates.name = str(body.name).trim();
  }
  const specFields: [string, string, number][] = [
    ["vcpu", "vCPU", 10_000],
    ["ram_gb", "RAM", 1_000_000],
    ["gpu", "GPU", 1_000],
    ["bandwidth", "Bandwidth", 100_000],
  ];
  for (const [key, label, max] of specFields) {
    if (key in body) {
      const err = wholeNumberError(str(body[key]), { label, max });
      if (err) return json(400, { error: err });
      updates[key] = Number(body[key]);
    }
  }
  if ("price" in body) {
    const err = decimalError(str(body.price), { label: "Price", min: 0.01, max: 100_000 });
    if (err) return json(400, { error: err });
    updates.price = Math.round(Number(body.price) * 100) / 100;
  }

  if (Object.keys(updates).length === 0) {
    return json(400, { error: "Nothing to update" });
  }

  const res = await supabaseFetch(`/rest/v1/node_tiers?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (res.status >= 400) {
    const msg = (res.error ?? "").includes("node_tiers_code_key")
      ? "A node option with this code already exists"
      : res.error ?? "Could not update node option";
    return json(res.status, { error: msg });
  }
  return json(200, { ok: true });
}

/** DELETE /api/admin/node-tiers/[id] — only while no nodes/jobs use it. */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const { id } = await params;

  const [nodesRes, jobsRes] = await Promise.all([
    supabaseFetch<CountRow[]>(`/rest/v1/nodes?select=id&tier=eq.${id}`),
    supabaseFetch<CountRow[]>(`/rest/v1/jobs?select=id&min_tier=eq.${id}`),
  ]);
  const inUse =
    (nodesRes.status === 200 ? (nodesRes.data ?? []).length : 0) +
    (jobsRes.status === 200 ? (jobsRes.data ?? []).length : 0);
  if (inUse > 0) {
    return json(409, {
      error: "This node option is used by existing nodes or jobs and cannot be removed",
    });
  }

  const res = await supabaseFetch(`/rest/v1/node_tiers?id=eq.${id}`, { method: "DELETE" });
  if (res.status >= 400) {
    return json(res.status, { error: res.error ?? "Could not remove node option" });
  }
  return json(200, { ok: true });
}
