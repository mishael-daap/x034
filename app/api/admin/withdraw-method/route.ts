import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type SettingRow = { key: string; value: string | number | boolean };
type PresetRow = { id: string; amount: number };

/**
 * GET /api/admin/withdraw-method — the configured withdrawal method (admin).
 * PATCH /api/admin/withdraw-method — set mode to 'input' | 'presets'.
 * Presets are edited via /api/admin/withdraw-presets (POST) and
 * /api/admin/withdraw-presets/[id] (PATCH / DELETE).
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });

  const [settingRes, presetsRes] = await Promise.all([
    supabaseFetch<SettingRow[]>(`/rest/v1/app_settings?key=eq.withdrawal_mode&limit=1`),
    supabaseFetch<PresetRow[]>(`/rest/v1/withdrawal_presets?select=id,amount&order=amount.asc`),
  ]);

  const raw =
    settingRes.status === 200 && settingRes.data?.length
      ? settingRes.data[0].value
      : "input";
  const mode = raw === "presets" ? "presets" : "input";

  const presets =
    presetsRes.status === 200
      ? (presetsRes.data ?? []).map((p) => ({
          id: p.id,
          amount: Math.round(Number(p.amount) * 100) / 100,
        }))
      : [];

  return json(200, { mode, presets });
}

export async function PATCH(req: Request) {
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

  const mode = body.mode;
  if (mode !== "input" && mode !== "presets") {
    return json(400, { error: "mode must be 'input' or 'presets'" });
  }

  const res = await supabaseFetch(`/rest/v1/app_settings?key=eq.withdrawal_mode`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ key: "withdrawal_mode", value: mode }),
  });
  if (res.status >= 400) {
    return json(res.status, { error: res.error ?? "Could not save withdrawal method" });
  }

  return json(200, { ok: true, mode });
}
