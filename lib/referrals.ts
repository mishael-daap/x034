import { supabaseFetch } from "@/lib/supabase";

export type Referee = {
  id: string;
  name: string;
  created_at: string;
  qualifying: boolean;
};

export type ReferralInfo = {
  referral_code: string;
  total_referees: number;
  qualifying_count: number;
  referees: Referee[];
};

/**
 * Referral info for a user. A referral qualifies once the referee owns
 * at least one node (business rule: "counts once the referred user purchases
 * a node").
 */
export async function getReferralInfo(userId: string): Promise<ReferralInfo | null> {
  const userRes = await supabaseFetch<{ referral_code: string }[]>(
    `/rest/v1/users?select=referral_code&id=eq.${userId}&limit=1`
  );
  const user = userRes.data?.[0];
  if (!user) return null;

  const refsRes = await supabaseFetch<
    { id: string; name: string; created_at: string; nodes: { count: number }[] }[]
  >(
    `/rest/v1/users?select=id,name,created_at,nodes(count)&referrer=eq.${userId}&order=created_at.desc`
  );

  const referees: Referee[] = (refsRes.status === 200 ? refsRes.data ?? [] : []).map((r) => ({
    id: r.id,
    name: r.name,
    created_at: r.created_at,
    qualifying: (r.nodes?.[0]?.count ?? 0) > 0,
  }));

  return {
    referral_code: user.referral_code,
    total_referees: referees.length,
    qualifying_count: referees.filter((r) => r.qualifying).length,
    referees,
  };
}
