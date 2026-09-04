import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import {
  deriveJobStatus,
  estimateDuration,
  estimateEarnings,
  maxPoolSize,
  nodeQualifies,
} from "@/lib/jobs";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type JobRow = {
  id: string;
  total_payout: number;
  duration_hours: number;
  actual_duration_hours: number | null;
  starts_at: string;
  required_referrals: number;
  company: { name: string } | null;
  min_tier: { code: string; name: string } | null;
};

type AssignmentRow = {
  status: string;
  created_at: string;
  node: {
    id: string;
    owner: { id: string; name: string } | null;
    tier: { code: string } | null;
  } | null;
};

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
    `/rest/v1/assignments?select=node:nodes(id,owner:users(id,name),tier:node_tiers(code)),status,created_at&job=eq.${jobId}`
  );
  const assignments = assignRes.status === 200 ? (assignRes.data ?? []) : [];
  const poolMembers = assignments.filter(
    (a) => a.status === "committed" || a.status === "active"
  );
  const poolCount = poolMembers.length;

  // Everyone whose node is in the pool (committed or running).
  const participants = poolMembers.map((a) => ({
    name: a.node?.owner?.name ?? "Unknown",
    node_id: a.node?.id ?? "",
    owner_id: a.node?.owner?.id ?? "",
    tier_code: a.node?.tier?.code ?? "",
    status: a.status,
    committed_at: a.created_at,
  }));

  const realizedDuration = job.actual_duration_hours ?? estimateDuration(job.duration_hours, poolCount);
  const now = Date.now();

  const payload = {
    id: job.id,
    company: job.company?.name ?? "Unknown",
    tier: job.min_tier?.code ?? "",
    tier_name: job.min_tier?.name ?? "",
    total_payout: job.total_payout,
    duration_hours: job.duration_hours,
    actual_duration_hours: job.actual_duration_hours,
    starts_at: job.starts_at,
    required_referrals: job.required_referrals,
    pool_count: poolCount,
    max_pool: maxPoolSize(job.total_payout),
    estimated_duration: Number(realizedDuration.toFixed(2)),
    estimated_earnings: Number(estimateEarnings(job.total_payout, poolCount).toFixed(2)),
    status: deriveJobStatus(job.starts_at, realizedDuration, now),
  };

  // Optional signed-in context: qualifying nodes + whether one is already committed.
  const session = await getSessionUser();
  if (!session) return json(200, { job: payload, participants, user: null });

  const nodesRes = await supabaseFetch<NodeRow[]>(
    `/rest/v1/nodes?select=id,tier:node_tiers(code,name)&owner=eq.${session.sub}`
  );
  const nodes = nodesRes.status === 200 ? (nodesRes.data ?? []) : [];

  // Nodes already in this job's pool + how many the user has committed.
  const jobMemberNodeIds = new Set(poolMembers.map((a) => a.node?.id));
  const committedCount = poolMembers.filter((a) => a.node?.owner?.id === session.sub).length;

  // A qualifying node is available when it isn't on this job and isn't busy on
  // another job that hasn't elapsed yet (mirrors the commit route's rules).
  const qualifyingNodes = nodes.filter((n) =>
    nodeQualifies(n.tier?.code ?? "", job.min_tier?.code ?? "")
  );
  const occupiedElsewhere = new Set<string>();
  if (qualifyingNodes.length) {
    const ids = qualifyingNodes.map((n) => n.id).join(",");
    const occRes = await supabaseFetch<
      {
        node: string;
        job: {
          starts_at: string;
          duration_hours: number;
          actual_duration_hours: number | null;
        } | null;
      }[]
    >(
      `/rest/v1/assignments?select=node,job:jobs(starts_at,duration_hours,actual_duration_hours)&node=in.(${ids})&status=in.(committed,active)`
    );
    for (const a of occRes.data ?? []) {
      if (jobMemberNodeIds.has(a.node)) continue; // committed to this job already = fine
      const dur = a.job?.actual_duration_hours ?? a.job?.duration_hours ?? 0;
      const elapsed =
        new Date(a.job?.starts_at ?? 0).getTime() + dur * 3_600_000 <= now;
      if (!elapsed) occupiedElsewhere.add(a.node);
    }
  }

  const userNodes = qualifyingNodes.map((n) => ({
    id: n.id,
    tier: n.tier?.code ?? "",
    available: !jobMemberNodeIds.has(n.id) && !occupiedElsewhere.has(n.id),
  }));

  return json(200, {
    job: payload,
    participants: participants.map((p) => ({ ...p, mine: p.owner_id === session.sub })),
    user: { nodes: userNodes, committed_count: committedCount },
  });
}
