const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY ?? "";

export type SupabaseResult<T = unknown> = {
  status: number;
  data: T | null;
  error: string | null;
};

/**
 * Server-side PostgREST helper. All DB access happens here (API routes only).
 * Uses the publishable key — fine for the Phase 1 sandbox.
 */
export async function supabaseFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<SupabaseResult<T>> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_API_KEY,
      Authorization: `Bearer ${SUPABASE_API_KEY}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  const text = await res.text();
  let data: T | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body
  }

  if (!res.ok) {
    const message =
      (data as { message?: string } | null)?.message ?? text ?? res.statusText;
    return { status: res.status, data: null, error: message };
  }

  return { status: res.status, data, error: null };
}
