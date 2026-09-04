import { Suspense } from "react";
import { PurchaseCompleteClient } from "@/components/nodes/purchase-complete-client";

export default function PurchaseCompletePage() {
  return (
    <Suspense fallback={null}>
      <PurchaseCompleteClient />
    </Suspense>
  );
}
