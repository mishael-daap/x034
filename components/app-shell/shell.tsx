"use client";

import { usePathname } from "next/navigation";
import { BottomTabs } from "./bottom-tabs";

const TAB_ROUTES = ["/", "/marketplace", "/nodes"];

/** App shell: adds the bottom tab bar (and content padding) on the 3 tab routes. */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showTabs = TAB_ROUTES.includes(pathname);

  return (
    <>
      {showTabs ? <div className="pb-20">{children}</div> : children}
      {showTabs && <BottomTabs />}
    </>
  );
}
