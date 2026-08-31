"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpFromLine, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Transaction = {
  id: string;
  type: string;
  amount: number;
  status: string | null;
  created_at: string;
  company: string | null;
};

export function WithdrawClient() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [amount, setAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/transactions")
      .then((r) => (r.ok ? r.json() : { balance: null, transactions: [] }))
      .then((d) => {
        setBalance(d.balance ?? 0);
        setTransactions(d.transactions ?? []);
      })
      .catch(() => {
        setBalance(0);
        setTransactions([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleWithdraw() {
    setWithdrawing(true);
    setError(null);
    const res = await fetch("/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount) }),
    });
    setWithdrawing(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not withdraw");
      return;
    }
    setAmount("");
    load();
  }

  async function handleProcess(id: string) {
    setProcessingId(id);
    const res = await fetch(`/api/withdrawals/${id}/process`, { method: "POST" });
    setProcessingId(null);
    if (res.ok) load();
  }

  const withdrawals = transactions.filter((t) => t.type === "withdrawal");

  const typeLabel: Record<string, string> = {
    earnings: "Earnings",
    purchase: "Purchase",
    deposit: "Deposit",
    withdrawal: "Withdrawal",
  };

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="-ml-2">
        <ArrowLeft />
        Back
      </Button>

      <Card className="mt-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="size-4" />
            Withdraw
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Available balance</p>
            <p className="text-2xl font-semibold">
              {balance == null ? "—" : `$${Number(balance).toFixed(2)}`}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="withdraw-amount">Amount</Label>
            <Input
              id="withdraw-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleWithdraw} disabled={withdrawing || !amount} className="w-full">
            <ArrowUpFromLine />
            {withdrawing ? "Requesting…" : "Request withdrawal"}
          </Button>
        </CardContent>
      </Card>

      <h2 className="mt-6 text-sm font-medium text-muted-foreground">Withdrawals</h2>
      {withdrawals.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No withdrawals yet.</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {withdrawals.map((w) => (
            <li key={w.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">−${Math.abs(w.amount).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(w.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={w.status === "processed" ? "default" : "outline"}>
                  {w.status}
                </Badge>
                {w.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleProcess(w.id)}
                    disabled={processingId === w.id}
                  >
                    {processingId === w.id ? "…" : "Process"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-6 text-sm font-medium text-muted-foreground">Transaction history</h2>
      {balance == null ? (
        <div className="mt-2 grid gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : transactions.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No transactions yet.</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {transactions.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{typeLabel[t.type] ?? t.type}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleString()}
                  {t.company ? ` · ${t.company}` : ""}
                </p>
              </div>
              <p
                className={
                  t.amount >= 0
                    ? "text-sm font-medium text-emerald-600"
                    : "text-sm font-medium text-red-600"
                }
              >
                {t.amount >= 0 ? "+" : ""}${Number(t.amount).toFixed(2)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
