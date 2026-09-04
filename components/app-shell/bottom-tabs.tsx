"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Server, Store } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/nodes", label: "Nodes", icon: Server },
];

/** Fixed bottom tab bar (mobile-first): Dashboard / Marketplace / Nodes. */
export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto grid h-16 max-w-md grid-cols-3">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || (tab.href !== "/" && pathname.startsWith(tab.href));
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
  );
}
