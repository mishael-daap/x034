"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dashboard } from "@/components/dashboard/dashboard-client";

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

  useEffect(() => {
    let ignore = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => {
        if (!ignore) {
          document.title = d.user ? "Dashboard" : "Compute Marketplace";
          setUser(d.user ?? null);
        }
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
          <Button variant="outline" onClick={() => router.push("/login")} className="h-10 w-full">
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return <Dashboard user={user} />;
}
