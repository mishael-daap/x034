import { Suspense } from "react";
import type { Metadata } from "next";
import { PurchaseCompleteClient } from "@/components/nodes/purchase-complete-client";

export const metadata: Metadata = { title: "Purchase complete" };

export default function PurchaseCompletePage() {
  return (
    <Suspense fallback={null}>
      <PurchaseCompleteClient />
    </Suspense>
  );
}
