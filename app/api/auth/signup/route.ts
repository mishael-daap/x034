import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseFetch } from "@/lib/supabase";
import { hashPassword } from "@/lib/auth/password";
import { COOKIE_NAME, createSession, sessionCookieOptions } from "@/lib/auth/session";
import { generateReferralCode } from "@/lib/auth/referral";
import { sanitizeUser } from "@/lib/auth/user";
import { PLATFORM_USER_ID } from "@/lib/constants";
import { emailError, nameError, passwordError, phoneError } from "@/lib/validation";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/**
 * POST /api/auth/signup
 * Body: { name, password, email, phone, referral_code? }
 * Both email and phone are required (Paystack needs a customer email for node
 * purchases; phone is the user's identifier). Creates the account, starts a
 * session.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const referralCode =
    typeof body.referral_code === "string" ? body.referral_code.trim().toUpperCase() : "";

  if (!name) return json(400, { error: "Name is required" });
  const nameErr = nameError(name);
  if (nameErr) return json(400, { error: nameErr });
  const passErr = passwordError(password);
  if (passErr) return json(400, { error: passErr });
  const emailErr = emailError(email);
  if (emailErr) return json(400, { error: emailErr });
  const phoneErr = phoneError(phone);
  if (phoneErr) return json(400, { error: phoneErr });

  // Resolve optional referrer
  let referrer: string | null = null;
  if (referralCode) {
    const res = await supabaseFetch<{ id: string }[]>(
      `/rest/v1/users?select=id&referral_code=eq.${encodeURIComponent(referralCode)}&id=neq.${PLATFORM_USER_ID}&limit=1`
    );
    if (res.status === 200 && res.data?.length) {
      referrer = res.data[0].id;
    } else {
      return json(400, { error: "Invalid referral code" });
    }
  }

  const passwordHash = await hashPassword(password);

  // Insert with retry: referral codes are random and may rarely collide.
  let user: Record<string, unknown> | null = null;
  let error: string | null = null;
  let status = 400;

  for (let attempt = 0; attempt < 3 && !user; attempt++) {
    const res = await supabaseFetch<Record<string, unknown>[]>(
      `/rest/v1/users?select=*`,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          name,
          email: email || null,
          phone: phone || null,
          password_hash: passwordHash,
          referral_code: generateReferralCode(),
          referrer,
        }),
      }
    );

    if (res.status === 201) {
      user = res.data?.[0] ?? null;
    } else if (res.status === 409 && res.error?.includes("users_referral_code_key")) {
      continue; // referral code collision — regenerate
    } else if (res.status === 409) {
      if (res.error?.includes("users_email_key")) {
        error = "Email is already in use";
        status = 409;
      } else if (res.error?.includes("users_phone_key")) {
        error = "Phone number is already in use";
        status = 409;
      } else {
        error = res.error ?? "Could not create account";
        status = 500;
      }
      break;
    } else {
      error = res.error ?? "Could not create account";
      status = 500;
      break;
    }
  }

  if (!user) return json(status, { error: error ?? "Could not create account" });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createSession(user.id as string), sessionCookieOptions());

  return json(201, { user: sanitizeUser(user) });
}
