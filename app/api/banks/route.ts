import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/** GET /api/banks — seeded banks for the profile account-details dropdown. */
export async function GET() {
  const res = await supabaseFetch<{ id: string; name: string }[]>(
    `/rest/v1/banks?select=id,name&order=name`
  );
  if (res.status !== 200) return json(res.status, { error: res.error });
  return json(200, { banks: res.data ?? [] });
}
