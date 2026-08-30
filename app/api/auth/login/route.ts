import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseFetch } from "@/lib/supabase";
import { verifyPassword } from "@/lib/auth/password";
import { COOKIE_NAME, createSession, sessionCookieOptions } from "@/lib/auth/session";
import { sanitizeUser } from "@/lib/auth/user";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/**
 * POST /api/auth/login
 * Body: { identifier, password } — identifier is an email OR phone number.
 * Credentials are verified against the users table (no auth library).
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!identifier || !password) {
    return json(400, { error: "Identifier and password are required" });
  }

  // Match either email (case-insensitive) or phone. Values are double-quoted
  // for PostgREST (emails contain reserved chars like '.'), quotes stripped.
  const safe = (v: string) => encodeURIComponent(v.replace(/"/g, ""));
  const res = await supabaseFetch<Record<string, unknown>[]>(
    `/rest/v1/users?select=*&or=(email.eq."${safe(identifier.toLowerCase())}",phone.eq."${safe(identifier)}")&limit=1`
  );

  const user = res.status === 200 ? res.data?.[0] : null;
  if (!user || typeof user.password_hash !== "string") {
    return json(401, { error: "Invalid credentials" });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return json(401, { error: "Invalid credentials" });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createSession(user.id as string), sessionCookieOptions());

  return json(200, { user: sanitizeUser(user) });
}
