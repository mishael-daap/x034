import { supabaseFetch } from "@/lib/supabase";
import { shortLabelError } from "@/lib/validation";

export type CompanyRow = { id: string; name: string };

/**
 * Find an existing company by name (case-insensitive) or create it. Used when
 * the admin types a company name on the job form — the name is persisted to
 * the predefined company list so it is offered next time.
 */
export async function resolveCompanyByName(
  rawName: string
): Promise<{ id: string } | { error: string }> {
  const name = rawName.trim();
  const nameErr = shortLabelError(name, "Company");
  if (nameErr) return { error: nameErr };

  const find = await supabaseFetch<CompanyRow[]>(
    `/rest/v1/companies?select=id,name&name=ilike.${encodeURIComponent(name)}&limit=1`
  );
  if (find.status === 200 && find.data?.length) {
    return { id: find.data[0].id };
  }
  if (find.status !== 200) {
    return { error: find.error ?? "Could not look up company" };
  }

  const create = await supabaseFetch<CompanyRow[]>(`/rest/v1/companies?select=id`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name }),
  });
  if (create.status !== 201 || !create.data?.[0]) {
    return { error: create.error ?? "Could not save company" };
  }
  return { id: create.data[0].id };
}

/** Resolve the company for a job payload: by id when supplied, else by name. */
export async function resolveJobCompany(body: Record<string, unknown>): Promise<
  | { id: string }
  | { error: string }
  | { missing: true }
> {
  const companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";
  if (companyId) return { id: companyId };

  const companyName = typeof body.company_name === "string" ? body.company_name : "";
  if (companyName.trim()) {
    const resolved = await resolveCompanyByName(companyName);
    return resolved;
  }
  return { missing: true };
}
