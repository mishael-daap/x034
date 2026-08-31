import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/** GET /api/companies — companies with their open job counts (public). */
export async function GET() {
  const companiesRes = await supabaseFetch<{ id: string; name: string }[]>(
    `/rest/v1/companies?select=id,name&order=name`
  );
  if (companiesRes.status !== 200) {
    return json(companiesRes.status, { error: companiesRes.error });
  }

  const jobsRes = await supabaseFetch<{ company: string }[]>(
    `/rest/v1/jobs?select=company&status=eq.open`
  );
  const openByCompany = new Map<string, number>();
  if (jobsRes.status === 200 && jobsRes.data) {
    for (const j of jobsRes.data) {
      openByCompany.set(j.company, (openByCompany.get(j.company) ?? 0) + 1);
    }
  }

  const companies = (companiesRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    open_jobs_count: openByCompany.get(c.id) ?? 0,
  }));

  return json(200, { companies });
}
