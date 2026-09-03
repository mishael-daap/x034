"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Referral = {
  referral_code: string;
  total_referees: number;
  qualifying_count: number;
  referees: { id: string; name: string; created_at: string; qualifying: boolean }[];
};

type Commission = {
  id: string;
  amount: number;
  created_at: string;
  referee: string | null;
  tier: string | null;
};

export function ReferralsClient() {
  const router = useRouter();
  const [referral, setReferral] = useState<Referral | null>(null);
  const [commissions, setCommissions] = useState<Commission[] | null>(null);
  const [commissionEarnings, setCommissionEarnings] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/referrals/me")
      .then((r) => (r.ok ? r.json() : { referral: null }))
      .then((d) => {
        setReferral(d.referral ?? null);
        setCommissions(d.commissions ?? null);
        setCommissionEarnings(d.commission_earnings ?? null);
      })
      .catch(() => setReferral(null));
  }, []);

  async function copyCode() {
    if (!referral) return;
    try {
      await navigator.clipboard.writeText(referral.referral_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="-ml-2">
        <ArrowLeft />
        Back
      </Button>

      {!referral ? (
        <div className="mt-4 grid gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          <Card className="mt-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" />
                Referrals
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Your code</p>
                  <p className="font-mono text-sm font-medium">{referral.referral_code}</p>
                </div>
                <Button variant="outline" size="sm" onClick={copyCode}>
                  <Copy />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg border p-3">
                  <p className="text-xl font-semibold">{referral.total_referees}</p>
                  <p className="text-xs text-muted-foreground">Total referees</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xl font-semibold">{referral.qualifying_count}</p>
                  <p className="text-xs text-muted-foreground">Qualifying (own a node)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <h2 className="mt-6 text-sm font-medium text-muted-foreground">Referees</h2>
          {referral.referees.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No one has signed up with your code yet. Share it to earn 30% on every node they buy.
            </p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {referral.referees.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Joined {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={r.qualifying ? "default" : "outline"}>
                    {r.qualifying ? "Qualifying" : "No node yet"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-6 text-sm font-medium text-muted-foreground">Commission earnings</h2>
          <div className="mt-2 rounded-lg border p-3">
            <p className="text-xl font-semibold">
              {commissionEarnings == null ? "—" : `$${Number(commissionEarnings).toFixed(2)}`}
            </p>
            <p className="text-xs text-muted-foreground">30% of every node your referees buy</p>
          </div>
          {commissions == null ? (
            <div className="mt-2 grid gap-2">
              <Skeleton className="h-12 w-full" />
            </div>
          ) : commissions.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No commissions yet.</p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {commissions.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">
                      {c.referee
                        ? `From ${c.referee}'s ${c.tier ?? "node"} purchase`
                        : "Referral commission"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString()}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-emerald-600">
                    +${Number(c.amount).toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
