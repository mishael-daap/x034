"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Server, TrendingUp, Wallet } from "lucide-react";

type User = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  referral_code: string;
};

const FEATURES = [
  { label: "Financial products", icon: TrendingUp, href: "/marketplace", hint: "Browse jobs" },
  { label: "Management positions", icon: Server, href: "/nodes", hint: "Your nodes" },
  { label: "Company activity", icon: Building2, href: "/companies", hint: "Job posters" },
];

export function Dashboard({ user }: { user: User }) {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);

  const loadBalance = useCallback(() => {
    fetch("/api/transactions")
      .then((r) => (r.ok ? r.json() : { balance: null }))
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => setBalance(0));
  }, []);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <p className="text-sm text-muted-foreground">Welcome back</p>
      <h1 className="text-xl font-semibold tracking-tight">{user.name}</h1>

      <div className="mt-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="size-4" />
          Account balance
        </div>
        <p className="mt-2 text-3xl font-semibold tracking-tight">
          ${balance == null ? "—" : Number(balance).toFixed(2)}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <button
              key={f.href}
              onClick={() => router.push(f.href)}
              className="flex flex-col items-center gap-2 rounded-xl bg-card p-4 text-center ring-1 ring-foreground/10 transition-colors hover:bg-muted"
            >
              <Icon className="size-6" />
              <span className="text-xs leading-tight font-medium">{f.label}</span>
              <span className="text-[10px] text-muted-foreground">{f.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
