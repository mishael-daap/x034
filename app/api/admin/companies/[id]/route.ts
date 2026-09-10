import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRole } from "@/lib/auth/role";
import { shortLabelError } from "@/lib/validation";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

async function requireAdmin(): Promise<Response | null> {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });
  const role = await getUserRole(session.sub);
  if (role !== "admin") return json(403, { error: "Admin access required" });
  return null;
}

/** PATCH /api/admin/companies/[id] — rename a predefined company. */
export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const nameErr = shortLabelError(name, "Company");
  if (nameErr) return json(400, { error: nameErr });

  // No duplicate names (case-insensitive), leaving this row out of the check.
  const dupRes = await supabaseFetch<{ id: string }[]>(
    `/rest/v1/companies?select=id&name=ilike.${encodeURIComponent(name)}&id=neq.${id}&limit=1`
  );
  if (dupRes.status !== 200) {
    return json(dupRes.status, { error: dupRes.error ?? "Could not check company name" });
  }
  if (dupRes.data?.length) {
    return json(409, { error: "Another company already uses this name" });
  }

  const res = await supabaseFetch(`/rest/v1/companies?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  if (res.status >= 400) {
    return json(res.status, { error: res.error ?? "Could not rename company" });
  }
  return json(200, { ok: true, id, name });
}

/** DELETE /api/admin/companies/[id] — remove only when no job references it. */
export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const jobsRes = await supabaseFetch<{ id: string }[]>(
    `/rest/v1/jobs?select=id&company=eq.${id}&limit=1`
  );
  if (jobsRes.status === 200 && jobsRes.data?.length) {
    return json(409, {
      error: "This company has jobs and can't be removed. Rename it instead.",
    });
  }

  const res = await supabaseFetch(`/rest/v1/companies?id=eq.${id}`, { method: "DELETE" });
  if (res.status >= 400) {
    return json(res.status, { error: res.error ?? "Could not remove company" });
  }
  return json(200, { ok: true });
}
