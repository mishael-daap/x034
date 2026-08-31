import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/**
 * POST /api/deposits — add test funds (Phase 1 test currency, no cap).
 * Body: { amount }
 */
export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return json(400, { error: "Enter a valid deposit amount" });
  }

  const res = await supabaseFetch<{ id: string }[]>(`/rest/v1/transactions?select=id`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: session.sub,
      type: "deposit",
      amount: Math.round(amount * 100) / 100,
    }),
  });

  if (res.status !== 201) {
    return json(res.status, { error: res.error ?? "Could not process deposit" });
  }

  return json(201, { transaction: res.data?.[0] });
}
