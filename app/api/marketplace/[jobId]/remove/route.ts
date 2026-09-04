import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type JobRow = { starts_at: string; actual_duration_hours: number | null };
type NodeRow = { id: string; owner: string };
type AssignmentRow = { id: string };

type Params = { params: Promise<{ jobId: string }> };

/**
 * POST /api/marketplace/[jobId]/remove — pull a committed node out of the pool.
 * Allowed only before the job starts (pool not locked): owner, own node,
 * assignment exists + still `committed`.
 */
export async function POST(req: Request, { params }: Params) {
  const { jobId } = await params;
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }
  const nodeId = typeof body.nodeId === "string" ? body.nodeId.trim() : "";
  if (!nodeId) return json(400, { error: "nodeId is required" });

  const jobRes = await supabaseFetch<JobRow[]>(
    `/rest/v1/jobs?select=starts_at,actual_duration_hours&id=eq.${jobId}&limit=1`
  );
  const job = jobRes.data?.[0];
  if (!job) return json(404, { error: "Job not found" });

  const now = Date.now();
  if (now >= new Date(job.starts_at).getTime()) {
    return json(409, { error: "Job has already started — nodes can no longer be removed" });
  }

  const nodeRes = await supabaseFetch<NodeRow[]>(
    `/rest/v1/nodes?select=id,owner&id=eq.${nodeId}&limit=1`
  );
  const node = nodeRes.data?.[0];
  if (!node) return json(404, { error: "Node not found" });
  if (node.owner !== session.sub) return json(403, { error: "Not your node" });

  const assignRes = await supabaseFetch<AssignmentRow[]>(
    `/rest/v1/assignments?select=id&node=eq.${nodeId}&job=eq.${jobId}&status=eq.committed&limit=1`
  );
  const assignment = assignRes.data?.[0];
  if (!assignment) {
    return json(409, { error: "This node is not committed to the job" });
  }

  const delRes = await supabaseFetch(`/rest/v1/assignments?id=eq.${assignment.id}`, {
    method: "DELETE",
  });
  if (delRes.status >= 400) {
    return json(delRes.status, { error: delRes.error ?? "Could not remove node" });
  }

  return json(200, { removed: true });
}
