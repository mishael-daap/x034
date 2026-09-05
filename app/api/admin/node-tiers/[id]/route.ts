import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const money = (n: number) => Math.round(n * 100) / 100;

type CountRow = { count: number };

type Params = { params: Promise<{ id: string }> };

function readNumber(body: Record<string, unknown>, key: string, min: number): number | null {
  if (!(key in body)) return null;
  const n = Number(body[key]);
  if (!Number.isFinite(n) || n < min) return null;
  return money(n);
}

/** PATCH /api/admin/node-tiers/[id] — edit a node option. */
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
  if (typeof body.code === "string" && body.code.trim()) {
    const code = body.code.trim().toUpperCase();
    if (code.length > 8) return json(400, { error: "Code must be 8 characters or fewer" });
    updates.code = code;
  }
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  const vcpu = readNumber(body, "vcpu", 0);
  if (vcpu !== null) updates.vcpu = vcpu;
  const ramGb = readNumber(body, "ram_gb", 0);
  if (ramGb !== null) updates.ram_gb = ramGb;
  const gpu = readNumber(body, "gpu", 0);
  if (gpu !== null) updates.gpu = gpu;
  const bandwidth = readNumber(body, "bandwidth", 0);
  if (bandwidth !== null) updates.bandwidth = bandwidth;
  const price = readNumber(body, "price", 0.01);
  if (price !== null) updates.price = price;

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
