import { NextResponse } from "next/server";
import { supabaseFetch } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth/session";
import { deriveJobStatus } from "@/lib/jobs";
import { finalizeJobLock } from "@/lib/lock";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type NodeRow = {
  id: string;
  tier: {
    code: string;
    name: string;
    vcpu: number;
    ram_gb: number;
    gpu: number;
    bandwidth: number;
  } | null;
};

type AssignmentRow = {
  node: string;
  status: string;
  job: {
    id: string;
    pay_per_hour: number;
    duration_hours: number;
    actual_duration_hours: number | null;
    starts_at: string;
    company: { name: string } | null;
  } | null;
};

/** GET /api/nodes — the signed-in user's nodes + balance (locks started jobs first). */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return json(401, { error: "Not signed in" });

  const nodesRes = await supabaseFetch<NodeRow[]>(
    `/rest/v1/nodes?select=*,tier:node_tiers(code,name,vcpu,ram_gb,gpu,bandwidth)&owner=eq.${session.sub}&order=created_at`
  );
  if (nodesRes.status !== 200) return json(nodesRes.status, { error: nodesRes.error });
  const nodes = nodesRes.data ?? [];

  // Current assignments for these nodes (with the job they point to).
  let assignments: AssignmentRow[] = [];
  if (nodes.length) {
    const ids = nodes.map((n) => n.id).join(",");
    const assignRes = await supabaseFetch<AssignmentRow[]>(
      `/rest/v1/assignments?select=node,status,job:jobs(*,company:companies(name))&node=in.(${ids})`
    );
    assignments = assignRes.status === 200 ? (assignRes.data ?? []) : [];
  }

  // Catch-up: materialize earnings for any started, still-unlocked jobs we're on.
  const now = Date.now();
  const lockedJobIds = new Set<string>();
  for (const a of assignments) {
    if (!a.job) continue;
    const started = new Date(a.job.starts_at).getTime() <= now;
    const unlocked = a.job.actual_duration_hours == null;
    if (started && unlocked && !lockedJobIds.has(a.job.id)) {
      lockedJobIds.add(a.job.id);
      await finalizeJobLock(a.job.id);
    }
  }

  const balanceRes = await supabaseFetch<{ balance: number }[]>(
    `/rest/v1/user_balances?select=balance&user_id=eq.${session.sub}`
  );
  const balance =
    balanceRes.status === 200 && balanceRes.data?.length
      ? Number(balanceRes.data[0].balance ?? 0)
      : 0;

  const nodesOut = nodes.map((n) => {
    const assignment = assignments.find((a) => a.node === n.id);
    let occupied = false;
    let assignmentOut: {
      job_id: string;
      company: string;
      status: ReturnType<typeof deriveJobStatus>;
      estimated_earnings: number;
    } | null = null;

    if (assignment && assignment.job) {
      const dur = assignment.job.actual_duration_hours ?? assignment.job.duration_hours;
      const elapsed = new Date(assignment.job.starts_at).getTime() + dur * 3_600_000 <= now;
      occupied = !elapsed; // a node is free again once its job has elapsed
      assignmentOut = {
        job_id: assignment.job.id,
        company: assignment.job.company?.name ?? "Unknown",
        status: deriveJobStatus(assignment.job.starts_at, dur, now),
        estimated_earnings: Number((assignment.job.pay_per_hour * dur).toFixed(2)),
      };
    }

    return {
      id: n.id,
      tier_code: n.tier?.code ?? "",
      tier_name: n.tier?.name ?? "",
      vcpu: n.tier?.vcpu ?? 0,
      ram_gb: n.tier?.ram_gb ?? 0,
      gpu: n.tier?.gpu ?? 0,
      bandwidth: n.tier?.bandwidth ?? 0,
      status: occupied ? (assignment?.status === "active" ? "active" : "committed") : "available",
      assignment: assignmentOut,
    };
  });

  return json(200, { balance, nodes: nodesOut });
}
