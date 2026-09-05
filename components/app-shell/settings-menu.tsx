"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings, X } from "lucide-react";

/** The gear menu shared by every page (user app and admin app). */
export function SettingsMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <button
        aria-label="Settings"
        onClick={() => setOpen(true)}
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Settings className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div onClick={() => setOpen(false)} className="absolute inset-0 bg-black/60" />
          <aside className="absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col border-l border-border bg-card p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Settings</h2>
              <button
                aria-label="Close settings"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav className="mt-6 grid gap-1">
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="size-4" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </nav>
            <p className="mt-auto text-xs text-muted-foreground">
              {signingOut ? "" : "More options coming soon."}
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
