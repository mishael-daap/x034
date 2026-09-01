import { supabaseFetch } from "@/lib/supabase";

type JobRow = {
  id: string;
  starts_at: string;
  duration_hours: number;
  actual_duration_hours: number | null;
  total_payout: number;
};

type AssignmentRow = { id: string; node: { owner: string } | null };

export type LockResult = {
  locked: boolean;
  already_locked?: boolean;
  not_started?: boolean;
  pool_size?: number;
  actual_duration_hours?: number;
  earnings_amount?: number;
  transactions_created?: number;
  error?: string;
};

/**
 * Finalize a job's lock now that it has started: set actual_duration_hours
 * (duration_hours ÷ pool size), mark committed assignments active, and create
 * each pool node's earnings transaction. Idempotent — no-op if already locked.
 */
export async function finalizeJobLock(jobId: string): Promise<LockResult> {
  const now = Date.now();

  const jobRes = await supabaseFetch<JobRow[]>(
    `/rest/v1/jobs?select=id,starts_at,duration_hours,actual_duration_hours,total_payout&id=eq.${jobId}&limit=1`
  );
  const job = jobRes.data?.[0];
  if (!job) return { locked: false, error: "Job not found" };

  if (now < new Date(job.starts_at).getTime()) {
    return { locked: false, not_started: true };
  }
  if (job.actual_duration_hours != null) {
    return { locked: true, already_locked: true };
  }

  const assignRes = await supabaseFetch<AssignmentRow[]>(
    `/rest/v1/assignments?select=id,node:nodes(owner)&job=eq.${jobId}&status=eq.committed`
  );
  const assignments = assignRes.status === 200 ? (assignRes.data ?? []) : [];
  const n = assignments.length;

  const actualDuration = n > 0 ? job.duration_hours / n : job.duration_hours;
  // Pot split: each pool node earns total_payout ÷ pool size (n=0 → full pot, no transactions).
  const earningsAmount = Number((job.total_payout / Math.max(n, 1)).toFixed(2));

  const jobUpd = await supabaseFetch(`/rest/v1/jobs?id=eq.${jobId}`, {
    method: "PATCH",
    body: JSON.stringify({ actual_duration_hours: actualDuration, status: "locked" }),
  });
  if (jobUpd.status >= 400) {
    return { locked: false, error: jobUpd.error ?? "Could not lock job" };
  }

  let transactionsCreated = 0;
  if (n > 0) {
    const actUpd = await supabaseFetch(`/rest/v1/assignments?job=eq.${jobId}&status=eq.committed`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    if (actUpd.status >= 400) {
      return { locked: false, error: actUpd.error ?? "Could not activate assignments" };
    }

    for (const a of assignments) {
      const txRes = await supabaseFetch(`/rest/v1/transactions`, {
        method: "POST",
        body: JSON.stringify({
          user_id: a.node?.owner,
          type: "earnings",
          amount: earningsAmount,
          reference_id: a.id,
        }),
      });
      if (txRes.status === 201) transactionsCreated++;
    }
  }

  return {
    locked: true,
    pool_size: n,
    actual_duration_hours: Number(actualDuration.toFixed(2)),
    earnings_amount: earningsAmount,
    transactions_created: transactionsCreated,
  };
}
