"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type State =
  | { kind: "verifying" }
  | { kind: "success"; amount?: number; already: boolean }
  | { kind: "error"; message: string };

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Paystack redirects here after checkout (?reference=…); we verify server-side. */
export function DepositCompleteClient() {
  const router = useRouter();
  const params = useSearchParams();
  const reference = params.get("reference");
  const [state, setState] = useState<State>(() =>
    reference ? { kind: "verifying" } : { kind: "error", message: "Missing payment reference." }
  );
  const started = useRef(false);

  useEffect(() => {
    if (!reference || started.current) return;
    started.current = true;
    fetch("/api/deposits/paystack/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (r.ok) {
          setState({
            kind: "success",
            amount: typeof d?.amount === "number" ? d.amount : undefined,
            already: Boolean(d?.already_processed),
          });
        } else {
          setState({
            kind: "error",
            message: typeof d?.error === "string" ? d.error : "Could not verify payment.",
          });
        }
      })
      .catch(() => setState({ kind: "error", message: "Could not verify payment." }));
  }, [reference]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col p-6">
      <button
        type="button"
        onClick={() => router.push("/deposit")}
        aria-label="Back to deposit"
        className="inline-flex size-9 items-center justify-center self-start rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-5" />
      </button>

      <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        {state.kind === "verifying" && (
          <>
            <Loader2 className="size-10 animate-spin text-primary" />
            <h1 className="mt-5 text-lg font-semibold tracking-tight">
              Verifying your payment…
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">This takes a few seconds.</p>
          </>
        )}

        {state.kind === "success" && (
          <>
            <CheckCircle2 className="size-12 text-emerald-500" />
            <h1 className="mt-5 text-lg font-semibold tracking-tight">Deposit successful</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {state.already
                ? "Your wallet was already credited."
                : state.amount != null
                  ? `${money(state.amount)} was added to your wallet.`
                  : "Your wallet has been credited."}
            </p>
            <Button onClick={() => router.push("/me")} className="mt-6 w-full max-w-xs">
              View my profile
            </Button>
          </>
        )}

        {state.kind === "error" && (
          <>
            <XCircle className="size-12 text-destructive" />
            <h1 className="mt-5 text-lg font-semibold tracking-tight">
              Payment could not be completed
            </h1>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">{state.message}</p>
            <Button onClick={() => router.push("/deposit")} className="mt-6 w-full max-w-xs">
              Try again
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
