import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import {
  DEFAULT_WITHDRAWAL_POLICY,
  normalizeWithdrawalPolicy,
  withdrawalPolicyState,
} from "@/lib/withdrawal-policy";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type SettingRow = { key: string; value: unknown };
type PresetRow = { amount: number };

/**
 * GET /api/withdraw/method — how the signed-in user picks a withdrawal amount
 * and whether withdrawals are open right now.
 * mode 'input'   → free-form amount field
 * mode 'presets' → fixed-amount buttons (sorted asc)
 * policy         → the admin's withdrawal window + popup message
 * Absent settings default to 'input' / open. The admin controls both on
 * /admin → Transactions → Method.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const [settingRes, presetsRes, policyRes] = await Promise.all([
    supabaseFetch<SettingRow[]>(`/rest/v1/app_settings?key=eq.withdrawal_mode&limit=1`),
    supabaseFetch<PresetRow[]>(
      `/rest/v1/withdrawal_presets?select=amount&order=amount.asc`
    ),
    supabaseFetch<SettingRow[]>(
      `/rest/v1/app_settings?key=eq.withdrawal_policy&limit=1`
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

  const policyRaw =
    policyRes.status === 200 && policyRes.data?.length ? policyRes.data[0].value : null;
  const policy = withdrawalPolicyState(
    normalizeWithdrawalPolicy(policyRaw ?? DEFAULT_WITHDRAWAL_POLICY)
  );

  return json(200, { mode, presets, policy });
}
