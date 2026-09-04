"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Referral = {
  referral_code: string;
  total_referees: number;
  qualifying_count: number;
  referees: { id: string; name: string; created_at: string; qualifying: boolean }[];
};

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReferralsClient() {
  const router = useRouter();
  const [referral, setReferral] = useState<Referral | null>(null);
  const [commissionEarnings, setCommissionEarnings] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/referrals/me")
      .then((r) => (r.ok ? r.json() : { referral: null }))
      .then((d) => {
        setReferral(d.referral ?? null);
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
      // clipboard unavailable — ignore
    }
  }

  return (
    <div className="mx-auto w-full max-w-md p-6">
      {/* Back — icon only (router.back since referrals is reachable from several screens) */}
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Go back"
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-5" />
      </button>

      {!referral ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* Stat tiles: total / qualifying / commission / referral code (tap to copy) */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="flex min-h-28 flex-col rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="text-xs text-muted-foreground">Total referees</p>
              <p className="mt-auto pt-3 text-2xl font-semibold tracking-tight">
                {referral.total_referees}
              </p>
            </div>
            <div className="flex min-h-28 flex-col rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="text-xs text-muted-foreground">Qualifying referees</p>
              <p className="mt-auto pt-3 text-2xl font-semibold tracking-tight">
                {referral.qualifying_count}
              </p>
            </div>
            <div className="flex min-h-28 flex-col rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="text-xs text-muted-foreground">Commission earned</p>
              <p className="mt-auto pt-3 font-[var(--font-roboto-mono)] text-2xl font-bold tabular-nums tracking-tight">
                {commissionEarnings == null ? "—" : money(commissionEarnings)}
              </p>
            </div>
            <button
              type="button"
              onClick={copyCode}
              aria-label={`Copy referral code ${referral.referral_code}`}
              className="flex min-h-28 cursor-pointer flex-col rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/50"
            >
              <p
                className={
                  copied
                    ? "text-xs font-medium text-emerald-500"
                    : "text-xs text-muted-foreground"
                }
              >
                {copied ? "Copied!" : "Referral code"}
              </p>
              <span className="mt-auto flex items-center justify-between gap-2 pt-3">
                <span className="truncate font-[var(--font-roboto-mono)] text-xl font-bold tabular-nums tracking-tight">
                  {referral.referral_code}
                </span>
                {copied ? (
                  <Check className="size-4 shrink-0 text-emerald-500" />
                ) : (
                  <Copy className="size-4 shrink-0 text-muted-foreground" />
                )}
              </span>
            </button>
          </div>

          {/* Referees list */}
          <h2 className="mt-7 text-sm font-medium text-muted-foreground">Referees</h2>
          {referral.referees.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No one has signed up with your code yet. Share it to earn 30% on every node they buy.
            </p>
          ) : (
            <ul className="mt-2 max-h-[170px] divide-y divide-border/70 overflow-y-auto">
              {referral.referees.map((r) => (
                <li key={r.id} className="flex h-14 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Joined {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    variant={r.qualifying ? "default" : "outline"}
                    className="shrink-0"
                  >
                    {r.qualifying ? "Qualifying" : "No node yet"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
