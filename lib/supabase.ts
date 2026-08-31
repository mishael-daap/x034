const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY ?? "";

export type SupabaseResult<T = unknown> = {
  status: number;
  data: T | null;
  error: string | null;
};

async function request(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: string }> {
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

  return { status: res.status, body: await res.text() };
}

/**
 * Server-side PostgREST helper. All DB access happens here (API routes only).
 * Uses plain fetch (undici): robust connection pooling + multi-A-record failover.
 * Transport failures are retried once for idempotent (GET) requests only.
 */
export async function supabaseFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<SupabaseResult<T>> {
  const method = (init.method ?? "GET").toUpperCase();
  const attempts = method === "GET" ? 2 : 1;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const { status, body } = await request(path, init);

      let data: T | null = null;
      try {
        data = body ? JSON.parse(body) : null;
      } catch {
        // non-JSON body
      }

      if (status >= 400) {
        const message =
          (data as { message?: string } | null)?.message ?? (body || `HTTP ${status}`);
        return { status, data: null, error: message };
      }

      return { status, data, error: null };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Supabase request failed";
      // fall through to retry (GET only); POSTs fail fast so the client can retry safely
    }
  }

  return { status: 0, data: null, error: lastError };
}
