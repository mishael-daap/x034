import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { decimalError } from "@/lib/validation";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type PresetRow = { id: string; amount: number };

const PRESET_MIN = 0.01;
const PRESET_MAX = 100_000;

function parseAmount(body: Record<string, unknown>):
  | { ok: true; amount: number }
  | { ok: false; error: string } {
  const str = (v: unknown) => (v == null ? "" : String(v));
  const err = decimalError(str(body.amount), {
    label: "Amount",
    min: PRESET_MIN,
    max: PRESET_MAX,
  });
  if (err) return { ok: false, error: err };
  return { ok: true, amount: Math.round(Number(body.amount) * 100) / 100 };
}

/** POST /api/admin/withdraw-presets — add a fixed-amount withdrawal button. */
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

  const parsed = parseAmount(body);
  if (!parsed.ok) return json(400, { error: parsed.error });

  const res = await supabaseFetch<PresetRow[]>(`/rest/v1/withdrawal_presets?select=id,amount`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ amount: parsed.amount }),
  });
  if (res.status !== 201 || !res.data?.[0]) {
    return json(res.status >= 400 ? res.status : 502, {
      error: res.error ?? "Could not add preset",
    });
  }

  return json(201, { preset: res.data[0] });
}
