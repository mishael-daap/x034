import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type Tier = { id: string; code: string; name: string; vcpu: number; ram_gb: number; gpu: number; bandwidth: number; price: number };

/** GET /api/nodes/purchase — list purchasable tiers. */
export async function GET() {
  const res = await supabaseFetch<Tier[]>(
    `/rest/v1/node_tiers?select=id,code,name,vcpu,ram_gb,gpu,bandwidth,price&order=price`
  );
  if (res.status !== 200) return json(res.status, { error: res.error });
  return json(200, { tiers: res.data ?? [] });
}

/** POST /api/nodes/purchase — create a node of the given tier + 'purchase' debit transaction. */
export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }
  const tierId = typeof body.tierId === "string" ? body.tierId.trim() : "";
  if (!tierId) return json(400, { error: "tierId is required" });

  const tierRes = await supabaseFetch<{ id: string; code: string; price: number }[]>(
    `/rest/v1/node_tiers?select=id,code,price&id=eq.${tierId}&limit=1`
  );
  const tier = tierRes.data?.[0];
  if (!tier) return json(404, { error: "Tier not found" });

  // Create the node (status defaults to 'available').
  const nodeRes = await supabaseFetch<{ id: string }[]>(`/rest/v1/nodes?select=id`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ owner: session.sub, tier: tierId }),
  });
  if (nodeRes.status !== 201) {
    return json(nodeRes.status, { error: nodeRes.error ?? "Could not create node" });
  }
  const node = nodeRes.data?.[0];

  // Record the debit (Phase 1: no balance gate — balance may go negative).
  const txRes = await supabaseFetch(`/rest/v1/transactions`, {
    method: "POST",
    body: JSON.stringify({ user_id: session.sub, type: "purchase", amount: -Number(tier.price) }),
  });

  return json(201, {
    node,
    tier_code: tier.code,
    price: Number(tier.price),
    transaction_error: txRes.error, // best-effort; node is created even if the debit fails (test currency)
  });
}
