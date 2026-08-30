import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { sanitizeUser } from "@/lib/auth/user";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/** GET /api/auth/me — returns the current user, or 401. */
export async function GET() {
  const payload = await getSessionUser();
  if (!payload) return json(401, { error: "Not signed in" });

  const res = await supabaseFetch<Record<string, unknown>[]>(
    `/rest/v1/users?select=*&id=eq.${payload.sub}&limit=1`
  );

  if (res.status !== 200 || !res.data?.length) {
    return json(401, { error: "Not signed in" });
  }

  return json(200, { user: sanitizeUser(res.data[0]) });
}
