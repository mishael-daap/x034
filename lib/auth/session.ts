import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const AUTH_SECRET = process.env.AUTH_SECRET ?? "";
export const COOKIE_NAME = "x034_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type SessionPayload = { sub: string; exp: number };

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: SessionPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Issue a new session token for a user id. */
export function createSession(userId: string): string {
  return sign({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });
}

/** Verify a session token. Returns the payload, or null if invalid/expired. */
export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token || !AUTH_SECRET) return null;

  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Read + verify the session cookie. Returns the payload, or null. */
export async function getSessionUser(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(COOKIE_NAME)?.value);
}
