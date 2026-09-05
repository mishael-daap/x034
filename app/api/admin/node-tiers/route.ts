import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const money = (n: number) => Math.round(n * 100) / 100;

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

/** GET /api/admin/node-tiers — every node option (admin only). */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const res = await supabaseFetch<TierRow[]>(
    `/rest/v1/node_tiers?select=${TIER_SELECT}&order=price`
  );
  if (res.status !== 200) return json(res.status, { error: res.error });
  return json(200, { tiers: res.data ?? [] });
}

function readNumber(body: Record<string, unknown>, key: string, min: number): number | null {
  if (!(key in body)) return null;
  const n = Number(body[key]);
  if (!Number.isFinite(n) || n < min) return null;
  return money(n);
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

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const vcpu = readNumber(body, "vcpu", 0);
  const ramGb = readNumber(body, "ram_gb", 0);
  const gpu = readNumber(body, "gpu", 0);
  const bandwidth = readNumber(body, "bandwidth", 0);
  const price = readNumber(body, "price", 0.01);

  if (!code || !name) return json(400, { error: "code and name are required" });
  if (code.length > 8) return json(400, { error: "Code must be 8 characters or fewer" });
  if (vcpu === null || ramGb === null || gpu === null || bandwidth === null || price === null) {
    return json(400, { error: "Specs and price must be non-negative numbers" });
  }

  const res = await supabaseFetch<TierRow[]>(`/rest/v1/node_tiers?select=id`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ code, name, vcpu, ram_gb: ramGb, gpu, bandwidth, price }),
  });
  if (res.status !== 201) {
    const msg = (res.error ?? "").includes("node_tiers_code_key")
      ? "A node option with this code already exists"
      : res.error ?? "Could not create node option";
    return json(res.status, { error: msg });
  }
  return json(201, { id: res.data?.[0]?.id });
}
