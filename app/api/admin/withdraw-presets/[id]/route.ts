import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { decimalError } from "@/lib/validation";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

const PRESET_MIN = 0.01;
const PRESET_MAX = 100_000;

/** PATCH /api/admin/withdraw-presets/[id] — edit a preset amount. */
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

  const str = (v: unknown) => (v == null ? "" : String(v));
  const err = decimalError(str(body.amount), {
    label: "Amount",
    min: PRESET_MIN,
    max: PRESET_MAX,
  });
  if (err) return json(400, { error: err });
  const amount = Math.round(Number(body.amount) * 100) / 100;

  const res = await supabaseFetch(`/rest/v1/withdrawal_presets?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ amount }),
  });
  if (res.status >= 400) {
    return json(res.status, { error: res.error ?? "Could not update preset" });
  }
  return json(200, { ok: true, id, amount });
}

/** DELETE /api/admin/withdraw-presets/[id] — remove a preset button. */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const { id } = await params;

  const res = await supabaseFetch(`/rest/v1/withdrawal_presets?id=eq.${id}`, {
    method: "DELETE",
  });
  if (res.status >= 400) {
    return json(res.status, { error: res.error ?? "Could not remove preset" });
  }
  return json(200, { ok: true });
}
