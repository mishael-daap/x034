import { supabaseFetch } from "@/lib/supabase";

/** The user's role, or null when the user doesn't exist. */
export async function getUserRole(
  userId: string
): Promise<"admin" | "user" | null> {
  const res = await supabaseFetch<{ role: string }[]>(
    `/rest/v1/users?select=role&id=eq.${userId}&limit=1`
  );
  const role = res.data?.[0]?.role;
  if (role === "admin") return "admin";
  if (role === "user") return "user";
  return null;
}
