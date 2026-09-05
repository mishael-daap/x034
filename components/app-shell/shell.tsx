"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BottomTabs } from "./bottom-tabs";

const TAB_ROUTES = ["/", "/marketplace", "/nodes", "/me"];

/**
 * App shell: adds the bottom tab bar on the 4 tab routes — but only for a
 * signed-in user. While signed out the tab bar is hidden and any protected
 * route redirects to the sign-in page.
 *
 * The session is re-checked whenever we land on a protected route while
 * unsigned-in (covers both cold loads and the moment right after login), and
 * the redirect only fires once a fresh check confirms the session is gone.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<"unknown" | "in" | "out">("unknown");
  const protectedRoute = TAB_ROUTES.includes(pathname);

  useEffect(() => {
    // When we already know the user is signed in there is nothing to re-check
    // for the lifetime of this layout (navigations don't remount it).
    if (session === "in") return;

    let alive = true;
    const onResult = (isIn: boolean) => {
      if (!alive) return;
      if (isIn) {
        setSession("in");
        return;
      }
      setSession("out");
      if (TAB_ROUTES.includes(pathname)) {
        router.replace("/login");
      }
    };

    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => onResult(Boolean(d.user)))
      .catch(() => onResult(false));

    return () => {
      alive = false;
    };
  }, [session, pathname, router]);

  return (
    <>
      {protectedRoute && session === "in" ? <div className="pb-20">{children}</div> : children}
      {protectedRoute && session === "in" && <BottomTabs />}
    </>
  );
}
