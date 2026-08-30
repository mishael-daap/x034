import { cookies } from "next/headers";
import { COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session";

export const runtime = "nodejs";

/** POST /api/auth/logout — clears the session cookie. */
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", { ...sessionCookieOptions(), maxAge: 0 });
  return new Response(null, { status: 204 });
}
