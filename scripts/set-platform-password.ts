/**
 * One-off dev script: give the platform admin (PLATFORM_USER_ID) a real
 * password so it can sign in at platform@x034.local like any user.
 *
 * scrypt hashes can't be expressed in SQL, so this runs app-side.
 *
 * Usage:
 *   node --env-file=.env scripts/set-platform-password.ts '<password>'
 */
import { hashPassword, verifyPassword } from "../lib/auth/password.ts";
import { supabaseFetch } from "../lib/supabase.ts";
import { PLATFORM_USER_ID } from "../lib/constants.ts";

async function main() {
  const password = process.argv[2];
  if (!password || password.length < 6) {
    console.error("Usage: node --env-file=.env scripts/set-platform-password.ts '<password>'");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const res = await supabaseFetch<{ id: string }[]>(
    `/rest/v1/users?select=id&id=eq.${PLATFORM_USER_ID}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ password_hash: passwordHash }),
    }
  );
  if (res.status !== 200 || !res.data?.length) {
    console.error("Failed to update platform user:", res.status, res.error);
    process.exit(1);
  }

  // Verify the stored hash round-trips before declaring success.
  const check = await supabaseFetch<{ password_hash: string }[]>(
    `/rest/v1/users?select=password_hash&id=eq.${PLATFORM_USER_ID}&limit=1`
  );
  const stored = check.data?.[0]?.password_hash;
  if (!stored || !(await verifyPassword(password, stored))) {
    console.error("Verification failed — stored hash does not match.");
    process.exit(1);
  }

  console.log("Platform admin password set. Sign in at platform@x034.local");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
