"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, Building2, Server, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [depositOpen, setDepositOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBalance = useCallback(() => {
    fetch("/api/transactions")
      .then((r) => (r.ok ? r.json() : { balance: null }))
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => setBalance(0));
  }, []);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  async function handleDeposit() {
    setDepositing(true);
    setError(null);
    const res = await fetch("/api/deposits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount) }),
    });
    setDepositing(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not deposit");
      return;
    }
    setDepositOpen(false);
    setAmount("");
    loadBalance();
  }

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
        <Button onClick={() => setDepositOpen(true)} className="mt-4 h-9 w-full">
          <ArrowDownToLine />
          Deposit
        </Button>
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

      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deposit test funds</DialogTitle>
            <DialogDescription>Add test currency to your balance (Phase 1 sandbox).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="deposit-amount">Amount</Label>
            <Input
              id="deposit-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button onClick={handleDeposit} disabled={depositing || !amount}>
              {depositing ? "Adding…" : "Add funds"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
