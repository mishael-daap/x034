import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { resolveCompanyByName } from "@/lib/companies";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type CompanyRow = { id: string; name: string };

async function requireAdmin(): Promise<Response | null> {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });
  return null;
}

/** GET /api/admin/companies — every predefined company, alphabetical. */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [companiesRes, jobsRes] = await Promise.all([
    supabaseFetch<CompanyRow[]>(`/rest/v1/companies?select=id,name&order=name`),
    supabaseFetch<{ company: string }[]>(`/rest/v1/jobs?select=company`),
  ]);
  if (companiesRes.status !== 200) {
    return json(companiesRes.status, { error: companiesRes.error });
  }

  const perCompany = new Map<string, number>();
  for (const j of jobsRes.status === 200 ? (jobsRes.data ?? []) : []) {
    perCompany.set(j.company, (perCompany.get(j.company) ?? 0) + 1);
  }

  const companies = (companiesRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    jobs_count: perCompany.get(c.id) ?? 0,
  }));

  return json(200, { companies });
}

/** POST /api/admin/companies — add a predefined company by name. */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const name = typeof body.name === "string" ? body.name : "";
  const resolved = await resolveCompanyByName(name);
  if ("error" in resolved) return json(400, { error: resolved.error });

  return json(201, { id: resolved.id });
}
