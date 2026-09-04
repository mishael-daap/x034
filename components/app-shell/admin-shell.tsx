"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: ListChecks },
];

/** Admin app shell: fixed bottom tab bar (Dashboard / Withdrawals). */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showTabs = pathname === "/admin" || pathname.startsWith("/admin/withdrawals");

  return (
    <>
      {showTabs ? <div className="pb-20">{children}</div> : children}
      {showTabs && (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto grid h-16 max-w-md grid-cols-2">
            {TABS.map((tab) => {
              const active = pathname === tab.href;
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="size-5" />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
