"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/dashboard/dashboard-client";

type User = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  referral_code: string;
  role?: string;
};

export function HomeClient() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let ignore = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => {
        if (ignore) return;
        // Signed-out visitors go to the sign-in page; admins to the admin app.
        if (!d.user) {
          router.replace("/login");
          return;
        }
        if (d.user.role === "admin") {
          router.replace("/admin");
          return;
        }
        document.title = "Dashboard";
        setUser(d.user);
      })
      .catch(() => {
        if (!ignore) router.replace("/login");
      });
    return () => {
      ignore = true;
    };
  }, [router]);

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return <Dashboard user={user} />;
}
