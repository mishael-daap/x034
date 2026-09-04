"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Client-side guard for /admin/* (UX only — API routes enforce the real gate).
 * No session → /login; role !== 'admin' → /; otherwise renders children.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => {
        if (ignore) return;
        const user = d.user ?? null;
        if (!user) {
          router.replace("/login");
          return;
        }
        if (user.role !== "admin") {
          router.replace("/");
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (!ignore) router.replace("/login");
      });
    return () => {
      ignore = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
