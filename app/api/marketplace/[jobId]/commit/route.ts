import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { maxPoolSize, nodeQualifies } from "@/lib/jobs";
import { COMMIT_WINDOW_HOURS } from "@/lib/constants";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type JobRow = {
  id: string;
  starts_at: string;
  total_payout: number;
  min_tier: { code: string } | null;
};

type NodeRow = { id: string; owner: string; tier: { code: string } | null };

type Params = { params: Promise<{ jobId: string }> };

/** POST /api/marketplace/[jobId]/commit — commit a node to a job's pool. */
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

  const now = Date.now();

  const jobRes = await supabaseFetch<JobRow[]>(
    `/rest/v1/jobs?select=id,starts_at,total_payout,min_tier:node_tiers(code)&id=eq.${jobId}&limit=1`
  );
  const job = jobRes.data?.[0];
  if (!job) return json(404, { error: "Job not found" });

  const start = new Date(job.starts_at).getTime();
  if (now >= start) return json(409, { error: "Job has already started" });
  if (now > start - COMMIT_WINDOW_HOURS * 3_600_000) {
    return json(409, { error: "Commit window closed (within 1h of start)" });
  }

  const nodeRes = await supabaseFetch<NodeRow[]>(
    `/rest/v1/nodes?select=id,owner,tier:node_tiers(code)&id=eq.${nodeId}&limit=1`
  );
  const node = nodeRes.data?.[0];
  if (!node) return json(404, { error: "Node not found" });
  if (node.owner !== session.sub) return json(403, { error: "Not your node" });

  if (!nodeQualifies(node.tier?.code ?? "", job.min_tier?.code ?? "")) {
    return json(409, { error: "Node tier is too low for this job" });
  }

  // Already committed to this job?
  const existingRes = await supabaseFetch<{ id: string }[]>(
    `/rest/v1/assignments?select=id&node=eq.${nodeId}&job=eq.${jobId}&limit=1`
  );
  if (existingRes.data?.length) {
    return json(409, { error: "Node is already committed to this job" });
  }

  // Node not occupied elsewhere (any assignment whose job hasn't elapsed).
  const nodeAssignRes = await supabaseFetch<
    { job: { id: string; starts_at: string; duration_hours: number; actual_duration_hours: number | null } }[]
  >(`/rest/v1/assignments?select=job:jobs(id,starts_at,duration_hours,actual_duration_hours)&node=eq.${nodeId}`);
  if (nodeAssignRes.status === 200 && nodeAssignRes.data) {
    for (const a of nodeAssignRes.data) {
      const dur = a.job.actual_duration_hours ?? a.job.duration_hours;
      const elapsed = new Date(a.job.starts_at).getTime() + dur * 3_600_000 <= now;
      if (!elapsed) return json(409, { error: "Node is already committed to another job" });
    }
  }

  // Pool capacity.
  const poolRes = await supabaseFetch<{ status: string }[]>(
    `/rest/v1/assignments?select=status&job=eq.${jobId}`
  );
  const poolCount = (poolRes.data ?? []).filter(
    (a) => a.status === "committed" || a.status === "active"
  ).length;
  if (poolCount >= maxPoolSize(job.total_payout)) {
    return json(409, { error: "Job pool is at capacity" });
  }

  const createRes = await supabaseFetch<{ id: string }[]>(`/rest/v1/assignments?select=id`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ node: nodeId, job: jobId, status: "committed" }),
  });
  if (createRes.status !== 201) {
    return json(createRes.status, { error: createRes.error ?? "Could not commit node" });
  }

  return json(201, { assignment: createRes.data?.[0], pool_count: poolCount + 1 });
}
