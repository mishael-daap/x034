import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import {
  accountNumberError,
  emailError,
  nameError,
  phoneError,
} from "@/lib/validation";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  account_number: string | null;
  referral_code: string;
  role: string;
  bank: { id: string; name: string } | null;
};

const USER_SELECT = `id,name,email,phone,account_number,referral_code,role,bank:banks(id,name)`;

/** GET /api/me — the signed-in user's editable profile. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const res = await supabaseFetch<UserRow[]>(
    `/rest/v1/users?select=${USER_SELECT}&id=eq.${session.sub}&limit=1`
  );
  if (res.status !== 200 || !res.data?.[0]) {
    return json(404, { error: "User not found" });
  }
  return json(200, { user: res.data[0] });
}

/**
 * PATCH /api/me — update profile fields: name, email, phone, bank, account_number.
 * All fields optional; same format rules as signup; unique conflicts → 409.
 */
export async function PATCH(req: Request) {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const updates: Record<string, unknown> = {};

  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const err = nameError(name);
    if (err) return json(400, { error: err });
    updates.name = name;
  }
  if ("email" in body) {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const err = emailError(email);
    if (err) return json(400, { error: err });
    updates.email = email;
  }
  if ("phone" in body) {
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const err = phoneError(phone);
    if (err) return json(400, { error: err });
    updates.phone = phone;
  }
  if ("bank" in body) {
    const bank = body.bank;
    if (bank === null || bank === "") {
      updates.bank = null;
    } else if (typeof bank === "string" && UUID_RE.test(bank)) {
      const check = await supabaseFetch<{ id: string }[]>(
        `/rest/v1/banks?select=id&id=eq.${bank}&limit=1`
      );
      if (!check.data?.length) return json(400, { error: "Select a valid bank" });
      updates.bank = bank;
    } else {
      return json(400, { error: "Select a valid bank" });
    }
  }
  if ("account_number" in body) {
    const accountNumber = body.account_number;
    if (accountNumber === null || accountNumber === "") {
      updates.account_number = null;
    } else if (typeof accountNumber === "string") {
      const err = accountNumberError(accountNumber, { required: true });
      if (err) return json(400, { error: err });
      updates.account_number = accountNumber.trim();
    } else {
      return json(400, { error: "Enter a valid account number" });
    }
  }

  if (Object.keys(updates).length === 0) {
    return json(400, { error: "Nothing to update" });
  }

  const res = await supabaseFetch<UserRow[]>(
    `/rest/v1/users?select=${USER_SELECT}&id=eq.${session.sub}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(updates),
    }
  );

  if (res.status !== 200 || !res.data?.[0]) {
    const err = res.error ?? "";
    if (res.status === 409) {
      if (err.includes("users_email_key")) {
        return json(409, { error: "Email is already in use" });
      }
      if (err.includes("users_phone_key")) {
        return json(409, { error: "Phone number is already in use" });
      }
    }
    return json(res.status, { error: err || "Could not update profile" });
  }

  return json(200, { user: res.data[0] });
}
