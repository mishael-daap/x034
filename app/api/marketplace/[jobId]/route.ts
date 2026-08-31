import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import {
  deriveJobStatus,
  estimateDuration,
  maxPoolSize,
  nodeQualifies,
} from "@/lib/jobs";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type JobRow = {
  id: string;
  pay_per_hour: number;
  duration_hours: number;
  actual_duration_hours: number | null;
  starts_at: string;
  required_referrals: number;
  company: { name: string } | null;
  min_tier: { code: string; name: string } | null;
};

type AssignmentRow = { node: string; status: string };

type NodeRow = { id: string; tier: { code: string; name: string } | null };

type Params = { params: Promise<{ jobId: string }> };

/** GET /api/marketplace/[jobId] — job detail (public) + optional signed-in context. */
export async function GET(_req: Request, { params }: Params) {
  const { jobId } = await params;

  const jobsRes = await supabaseFetch<JobRow[]>(
    `/rest/v1/jobs?select=*,company:companies(name),min_tier:node_tiers(code,name)&id=eq.${jobId}&limit=1`
  );
  if (jobsRes.status !== 200) return json(jobsRes.status, { error: jobsRes.error });
  const job = jobsRes.data?.[0];
  if (!job) return json(404, { error: "Job not found" });

  const assignRes = await supabaseFetch<AssignmentRow[]>(
    `/rest/v1/assignments?select=node,status&job=eq.${jobId}`
  );
  const assignments = assignRes.status === 200 ? (assignRes.data ?? []) : [];
  const poolCount = assignments.filter(
    (a) => a.status === "committed" || a.status === "active"
  ).length;

  const realizedDuration = job.actual_duration_hours ?? estimateDuration(job.duration_hours, poolCount);
  const now = Date.now();

  const payload = {
    id: job.id,
    company: job.company?.name ?? "Unknown",
    tier: job.min_tier?.code ?? "",
    tier_name: job.min_tier?.name ?? "",
    pay_per_hour: job.pay_per_hour,
    duration_hours: job.duration_hours,
    actual_duration_hours: job.actual_duration_hours,
    starts_at: job.starts_at,
    required_referrals: job.required_referrals,
    pool_count: poolCount,
    max_pool: maxPoolSize(job.pay_per_hour, job.duration_hours),
    estimated_duration: Number(realizedDuration.toFixed(2)),
    estimated_earnings: Number((job.pay_per_hour * realizedDuration).toFixed(2)),
    status: deriveJobStatus(job.starts_at, realizedDuration, now),
  };

  // Optional signed-in context: qualifying nodes + whether one is already committed.
  const session = await getSessionUser();
  if (!session) return json(200, { job: payload, user: null });

  const nodesRes = await supabaseFetch<NodeRow[]>(
    `/rest/v1/nodes?select=id,tier:node_tiers(code,name)&owner=eq.${session.sub}`
  );
  const nodes = nodesRes.status === 200 ? (nodesRes.data ?? []) : [];

  const committedNodeIds = new Set(assignments.map((a) => a.node));
  const qualifyingNodes = nodes
    .filter((n) => nodeQualifies(n.tier?.code ?? "", job.min_tier?.code ?? ""))
    .map((n) => ({ id: n.id, tier: n.tier?.code ?? "" }));
  const committedNodeId = qualifyingNodes.find((n) => committedNodeIds.has(n.id))?.id ?? null;

  return json(200, {
    job: payload,
    user: { qualifying_nodes: qualifyingNodes, committed_node_id: committedNodeId },
  });
}
