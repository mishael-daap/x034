import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { paystackResolveAccount } from "@/lib/paystack";
import { isTestMode, paystackMode } from "@/lib/paystack";
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

type BankRow = { id: string; name: string; code: string | null };

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  account_number: string | null;
  account_name: string | null;
  referral_code: string;
  role: string;
  bank: BankRow | null;
};

type DestinationRow = {
  bank: BankRow | null;
  account_number: string | null;
  account_name: string | null;
  account_name_mode: string | null;
};

const USER_SELECT = `id,name,email,phone,account_number,account_name,referral_code,role,bank:banks(id,name,code)`;

async function loadDestination(userId: string): Promise<DestinationRow | null> {
  const res = await supabaseFetch<DestinationRow[]>(
    `/rest/v1/users?select=bank:banks(id,name,code),account_number,account_name,account_name_mode&id=eq.${userId}&limit=1`
  );
  return res.status === 200 ? (res.data?.[0] ?? null) : null;
}

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
 * Bank and account number are a pair: the account name is resolved by Paystack
 * (never typed) and stored as `users.account_name`. Unchanged destinations are
 * not re-resolved — test mode caps live resolves at 3/day.
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

  if ("bank" in body || "account_number" in body) {
    const current = await loadDestination(session.sub);
    if (!current) return json(404, { error: "User not found" });

    // Resolve the next destination from the pair (a missing half falls back
    // to what is already stored).
    let nextBank: BankRow | null = current.bank;
    if ("bank" in body) {
      const bank = body.bank;
      if (bank === null || bank === "") {
        nextBank = null;
      } else if (typeof bank === "string" && UUID_RE.test(bank)) {
        const check = await supabaseFetch<BankRow[]>(
          `/rest/v1/banks?select=id,name,code&id=eq.${bank}&limit=1`
        );
        if (!check.data?.length) return json(400, { error: "Select a valid bank" });
        nextBank = check.data[0];
      } else {
        return json(400, { error: "Select a valid bank" });
      }
    }

    let nextAccount: string | null = current.account_number;
    if ("account_number" in body) {
      const value = body.account_number;
      if (value === null || value === "") {
        nextAccount = null;
      } else if (typeof value === "string") {
        const err = accountNumberError(value, { required: true });
        if (err) return json(400, { error: err });
        nextAccount = value.trim();
      } else {
        return json(400, { error: "Enter a valid account number" });
      }
    }

    if (!nextBank || !nextAccount) {
      if (nextBank || nextAccount) {
        return json(400, { error: "Add both your bank and account number" });
      }
      updates.bank = null;
      updates.account_number = null;
      updates.account_name = null;
      updates.account_name_mode = null;
    } else {
      // A name verified in the other Paystack mode must be resolved again.
      const unchanged =
        nextBank.id === current.bank?.id &&
        nextAccount === current.account_number &&
        Boolean(current.account_name) &&
        current.account_name_mode === paystackMode();

      if (unchanged) {
        updates.bank = nextBank.id;
        updates.account_number = nextAccount;
      } else if (isTestMode()) {
        // Sandbox has no real accounts and caps live resolves at 3/day, so the
        // name is synthesized. Live mode always resolves with Paystack.
        updates.bank = nextBank.id;
        updates.account_number = nextAccount;
        updates.account_name = "SANDBOX TEST ACCOUNT";
        updates.account_name_mode = "test";
      } else {
        if (!nextBank.code) {
          return json(400, {
            error: "That bank cannot receive payouts — choose another bank",
          });
        }
        try {
          const resolved = await paystackResolveAccount({
            accountNumber: nextAccount,
            bankCode: nextBank.code,
          });
          updates.bank = nextBank.id;
          updates.account_number = nextAccount;
          updates.account_name = resolved.account_name;
          updates.account_name_mode = paystackMode();
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Could not verify that account";
          return json(400, { error: `Could not verify that account — ${message}` });
        }
      }
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
