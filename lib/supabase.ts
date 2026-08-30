import { request as httpsRequest, Agent, type AgentOptions } from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY ?? "";

const parsed = new URL(SUPABASE_URL);
const HOST = parsed.hostname;
const PORT = parsed.port || (parsed.protocol === "https:" ? "443" : "80");

// ---------------------------------------------------------------------------
// DNS: resolve the host once, then refresh in the background every 5 minutes.
// Cold lookups on this dev machine take ~5s; caching removes that stall.
// ---------------------------------------------------------------------------
let cached: { address: string; family: number } | null = null;
let resolvePromise: Promise<{ address: string; family: number }> | null = null;

function resolveHost(): Promise<{ address: string; family: number }> {
  resolvePromise ??= dnsLookup(HOST)
    .then((r) => {
      cached = r;
      return r;
    })
    .finally(() => {
      resolvePromise = null;
      setTimeout(resolveHost, 5 * 60 * 1000).unref();
    });
  return resolvePromise;
}

// Warm at module load (server context only)
if (HOST) resolveHost();

type LookupAddress = { address: string; family: number };

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address?: string | LookupAddress[],
  family?: number
) => void;

function cachedLookup(hostname: string, options: { all?: boolean }, callback: LookupCallback) {
  const deliver = (r: LookupAddress) => {
    if (options.all) callback(null, [r]);
    else callback(null, r.address, r.family);
  };
  const fail = (err: NodeJS.ErrnoException) => callback(err);

  if (hostname === HOST && cached) return deliver(cached);
  resolveHost().then(deliver, fail);
}

// Keep-alive agent: reuses sockets, so steady-state requests skip DNS/TLS/connect.
const agent = new Agent({
  keepAlive: true,
  maxSockets: 10,
  lookup: cachedLookup as unknown as AgentOptions["lookup"],
});

// ---------------------------------------------------------------------------

export type SupabaseResult<T = unknown> = {
  status: number;
  data: T | null;
  error: string | null;
};

function request(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const method = init.method ?? "GET";
    const headers: Record<string, string> = {
      apikey: SUPABASE_API_KEY,
      Authorization: `Bearer ${SUPABASE_API_KEY}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    };

    const req = httpsRequest(
      {
        host: HOST,
        port: PORT,
        path,
        method,
        headers,
        agent,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );

    req.setTimeout(15_000, () => req.destroy(new Error("Supabase request timed out")));
    req.on("error", reject);
    if (init.body) req.write(init.body as string);
    req.end();
  });
}

/**
 * Server-side PostgREST helper. All DB access happens here (API routes only).
 * Uses the publishable key — fine for the Phase 1 sandbox.
 */
export async function supabaseFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<SupabaseResult<T>> {
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
    return {
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : "Supabase request failed",
    };
  }
}
