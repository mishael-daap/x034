import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type SettingRow = { key: string; value: string | number | boolean };
type PresetRow = { amount: number };

/**
 * GET /api/withdraw/method — how the signed-in user picks a withdrawal amount.
 * mode 'input'   → free-form amount field
 * mode 'presets' → fixed-amount buttons (sorted asc)
 * Absent setting defaults to 'input'. The admin controls this on
 * /admin → Transactions → Method.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const [settingRes, presetsRes] = await Promise.all([
    supabaseFetch<SettingRow[]>(`/rest/v1/app_settings?key=eq.withdrawal_mode&limit=1`),
    supabaseFetch<PresetRow[]>(
      `/rest/v1/withdrawal_presets?select=amount&order=amount.asc`
    ),
  ]);

  const raw =
    settingRes.status === 200 && settingRes.data?.length
      ? settingRes.data[0].value
      : "input";
  const mode = raw === "presets" ? "presets" : "input";

  const presets =
    presetsRes.status === 200
      ? (presetsRes.data ?? []).map((p) => Math.round(Number(p.amount) * 100) / 100)
      : [];

  return json(200, { mode, presets });
}
