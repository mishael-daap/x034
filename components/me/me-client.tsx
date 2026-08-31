"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, LogOut, Users, ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type User = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  referral_code: string;
};

export function MeClient() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => {
        if (!ignore) setUser(d.user ?? null);
      })
      .catch(() => {
        if (!ignore) setUser(null);
      });
    return () => {
      ignore = true;
    };
  }, []);

  if (user === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Button onClick={() => router.push("/login")}>Sign in</Button>
      </div>
    );
  }

  const me = user;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(me.referral_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>{me.name}</CardTitle>
          <CardDescription>{me.email ?? me.phone}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-xs text-muted-foreground">Referral code</p>
              <p className="font-mono text-sm font-medium">{me.referral_code}</p>
            </div>
            <Button variant="outline" size="sm" onClick={copyCode}>
              <Copy />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button variant="outline" className="w-full" onClick={() => router.push("/referrals")}>
            <Users />
            My referrals
          </Button>
          <Button variant="outline" className="w-full" onClick={() => router.push("/withdraw")}>
            <ArrowUpFromLine />
            Withdraw
          </Button>
          <Button variant="destructive" className="w-full" onClick={handleSignOut} disabled={signingOut}>
            <LogOut />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
