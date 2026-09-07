import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { decimalError, nodeCodeError, shortLabelError, wholeNumberError } from "@/lib/validation";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type TierRow = {
  id: string;
  code: string;
  name: string;
  vcpu: number;
  ram_gb: number;
  gpu: number;
  bandwidth: number;
  price: number;
};

const TIER_SELECT = "id,code,name,vcpu,ram_gb,gpu,bandwidth,price";

type NodeRow = { tier: string | null; owner: string | null };

/**
 * GET /api/admin/node-tiers — every node option (admin only), each with how
 * many nodes were bought (`owned`) and by how many distinct people (`buyers`).
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const [res, nodesRes] = await Promise.all([
    supabaseFetch<TierRow[]>(
      `/rest/v1/node_tiers?select=${TIER_SELECT}&order=price`
    ),
    supabaseFetch<NodeRow[]>(
      `/rest/v1/nodes?select=tier,owner`,
      { headers: { Range: "0-99999" } }
    ),
  ]);
  if (res.status !== 200) return json(res.status, { error: res.error });

  // Per-tier purchase stats: node count + distinct buyers.
  const perTier = new Map<string, { owned: number; buyers: Set<string> }>();
  for (const n of nodesRes.status === 200 ? (nodesRes.data ?? []) : []) {
    if (!n.tier) continue;
    const entry = perTier.get(n.tier) ?? { owned: 0, buyers: new Set<string>() };
    entry.owned += 1;
    if (n.owner) entry.buyers.add(n.owner);
    perTier.set(n.tier, entry);
  }

  const tiers = (res.data ?? []).map((t) => {
    const stats = perTier.get(t.id);
    return {
      ...t,
      owned: stats?.owned ?? 0,
      buyers: stats?.buyers.size ?? 0,
    };
  });

  return json(200, { tiers });
}

function validateTier(
  body: Record<string, unknown>
): { error: string } | { values: Record<string, unknown> } {
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const str = (v: unknown) => (v == null ? "" : String(v));

  const checks: (string | null)[] = [
    nodeCodeError(code),
    shortLabelError(name, "Name"),
    wholeNumberError(str(body.vcpu), { label: "vCPU", max: 10_000 }),
    wholeNumberError(str(body.ram_gb), { label: "RAM", max: 1_000_000 }),
    wholeNumberError(str(body.gpu), { label: "GPU", max: 1_000 }),
    wholeNumberError(str(body.bandwidth), { label: "Bandwidth", max: 100_000 }),
    decimalError(str(body.price), { label: "Price", min: 0.01, max: 100_000 }),
  ];
  const firstError = checks.find((c): c is string => c !== null);
  if (firstError) return { error: firstError };

  return {
    values: {
      code,
      name,
      vcpu: Number(body.vcpu),
      ram_gb: Number(body.ram_gb),
      gpu: Number(body.gpu),
      bandwidth: Number(body.bandwidth),
      price: Math.round(Number(body.price) * 100) / 100,
    },
  };
}

/** POST /api/admin/node-tiers — add a new purchasable node option. */
export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const result = validateTier(body);
  if ("error" in result) return json(400, { error: result.error });

  const res = await supabaseFetch<TierRow[]>(`/rest/v1/node_tiers?select=id`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(result.values),
  });
  if (res.status !== 201) {
    const msg = (res.error ?? "").includes("node_tiers_code_key")
      ? "A node option with this code already exists"
      : res.error ?? "Could not create node option";
    return json(res.status, { error: msg });
  }
  return json(201, { id: res.data?.[0]?.id });
}
