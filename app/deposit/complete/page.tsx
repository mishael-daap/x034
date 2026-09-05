import { Suspense } from "react";
import type { Metadata } from "next";
import { DepositCompleteClient } from "@/components/deposit/deposit-complete-client";

export const metadata: Metadata = { title: "Deposit complete" };

export default function DepositCompletePage() {
  return (
    <Suspense fallback={null}>
      <DepositCompleteClient />
    </Suspense>
  );
}
