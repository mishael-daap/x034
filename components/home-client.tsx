"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export function HomeClient() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
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
      ignore = true; // drop stale responses (StrictMode double-effect)
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSigningOut(false);
    router.refresh();
  }

  if (user === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compute marketplace</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Own a node, earn from compute jobs.
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-3">
          <Button onClick={() => router.push("/signup")} className="h-10 w-full">
            Create account
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/login")}
            className="h-10 w-full"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Signed in as {user.name}</CardTitle>
          <CardDescription>
            {user.email ?? user.phone} · Referral code: {user.referral_code}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
