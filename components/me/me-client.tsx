"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Copy,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Profile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  account_number: string | null;
  bank: { id: string; name: string } | null;
};

type Bank = { id: string; name: string };

type Referral = {
  referral_code: string;
  total_referees: number;
  qualifying_count: number;
};

type WalletData = {
  balance: number | null;
  totalIncome: number | null;
};

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function MeClient() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [wallet, setWallet] = useState<WalletData>({ balance: null, totalIncome: null });
  const [referral, setReferral] = useState<Referral | null>(null);
  const [commissionEarnings, setCommissionEarnings] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable field state (initialised once the profile loads).
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bankId, setBankId] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  useEffect(() => {
    let ignore = false;
    Promise.all([
      fetch("/api/me").then((r) => (r.ok ? r.json() : { user: null, status: r.status })),
      fetch("/api/banks").then((r) => (r.ok ? r.json() : { banks: [] })),
      fetch("/api/transactions")
        .then((r) => (r.ok ? r.json() : { balance: null, total_income: null }))
        .catch(() => ({ balance: null, total_income: null })),
      fetch("/api/referrals/me")
        .then((r) => (r.ok ? r.json() : { referral: null, commission_earnings: null }))
        .catch(() => ({ referral: null, commission_earnings: null })),
    ])
      .then(([me, b, tx, ref]) => {
        if (ignore) return;
        const user = me.user ?? null;
        if (!user && me.status === 401) {
          router.replace("/login");
          return;
        }
        setProfile(user);
        if (user) {
          setName(user.name ?? "");
          setEmail(user.email ?? "");
          setPhone(user.phone ?? "");
          setBankId(user.bank?.id ?? "");
          setAccountNumber(user.account_number ?? "");
        }
        setBanks(b.banks ?? []);
        setWallet({
          balance: tx.balance == null ? null : Number(tx.balance),
          totalIncome: tx.total_income == null ? null : Number(tx.total_income),
        });
        setReferral(ref.referral ?? null);
        setCommissionEarnings(
          ref.commission_earnings == null ? null : Number(ref.commission_earnings)
        );
      })
      .catch(() => {
        if (!ignore) setProfile(null);
      });
    return () => {
      ignore = true;
    };
  }, [router]);

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

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        bank: bankId || null,
        account_number: accountNumber || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Could not save profile.");
      return;
    }
    const d = await res.json().catch(() => null);
    if (d?.user) {
      // Re-sync fields from the server so dirty tracking settles (e.g. email is lowercased).
      const u = d.user;
      setProfile(u);
      setName(u.name ?? "");
      setEmail(u.email ?? "");
      setPhone(u.phone ?? "");
      setBankId(u.bank?.id ?? "");
      setAccountNumber(u.account_number ?? "");
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  // Only show Save while something actually changed vs the loaded profile.
  const dirty = profile
    ? name !== profile.name ||
      email !== (profile.email ?? "") ||
      phone !== (profile.phone ?? "") ||
      bankId !== (profile.bank?.id ?? "") ||
      accountNumber !== (profile.account_number ?? "")
    : false;

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-md p-6">
        <Skeleton className="h-8 w-40" />
        <div className="mt-4 grid gap-4">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md p-6 pb-10">
      {/* Greeting */}
      <header>
        <p className="text-sm text-muted-foreground">Profile</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
          Hello{", "}
          <span className="text-primary">{profile.name}</span>
        </h1>
      </header>

      {/* Wallet balance + total income */}
      <section className="mt-6 grid grid-cols-2 gap-3">
        {/* Wallet balance — Deposit under it */}
        <div className="flex flex-col rounded-xl bg-[linear-gradient(135deg,var(--color-primary),oklch(0.42_0.11_70))] p-4 text-primary-foreground ring-1 ring-black/10">
          <p className="text-xs text-primary-foreground/70">Wallet balance</p>
          <p className="mt-2 font-[var(--font-roboto-mono)] text-2xl font-black tabular-nums tracking-tighter">
            {wallet.balance == null ? "—" : money(wallet.balance)}
          </p>
          <Link
            href="/deposit"
            className="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white/20 text-sm font-semibold text-white transition-colors hover:bg-white/30"
          >
            <ArrowDownToLine className="size-4" />
            Deposit
          </Link>
        </div>

        {/* Total income — Withdraw under it */}
        <div className="flex flex-col rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-xs text-muted-foreground">Total income</p>
          <p className="mt-2 font-[var(--font-roboto-mono)] text-2xl font-black tabular-nums tracking-tighter">
            {wallet.totalIncome == null ? "—" : money(wallet.totalIncome)}
          </p>
          <Link
            href="/withdraw"
            className="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <ArrowUpFromLine className="size-4" />
            Withdraw
          </Link>
        </div>
      </section>

      {/* Referrals (moved here from the dashboard) */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Referrals</h2>
          <Link href="/referrals" className="text-xs font-medium text-primary">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/referrals"
            className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50"
          >
            <p className="text-xs text-muted-foreground">Commission earned</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums tracking-tight">
              {commissionEarnings == null ? "—" : money(commissionEarnings)}
            </p>
          </Link>
          <Link
            href="/referrals"
            className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50"
          >
            <p className="text-xs text-muted-foreground">Total referrals</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">
              {referral?.total_referees ?? 0}
            </p>
          </Link>
        </div>
        {referral && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
            <div>
              <p className="text-xs text-muted-foreground">Your referral code</p>
              <p className="font-mono text-sm font-medium">{referral.referral_code}</p>
            </div>
            <button
              onClick={copyCode}
              className="flex items-center gap-1.5 text-xs font-medium text-primary"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </section>

      {/* Profile details */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="mt-8 grid gap-4"
      >
        <Card>
          <CardHeader>
            <CardTitle>Profile details</CardTitle>
            <CardDescription>
              Your name, email and phone — used to sign in.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bank details</CardTitle>
            <CardDescription>
              Where approved withdrawals are paid out.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="bank">Bank</Label>
              <select
                id="bank"
                value={bankId}
                onChange={(e) => setBankId(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
              >
                <option value="">Select a bank</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="account_number">Account number</Label>
              <Input
                id="account_number"
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 0123456789"
              />
            </div>
          </CardContent>
        </Card>

        {error && dirty && <p className="text-sm text-destructive">{error}</p>}
        {dirty && (
          <Button type="submit" disabled={saving} className="h-10 w-full">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        )}
        {saved && (
          <p className="text-center text-sm text-emerald-600">Changes saved.</p>
        )}
      </form>
    </div>
  );
}
