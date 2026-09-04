import { PurchaseClient } from "@/components/nodes/purchase-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Purchase a node" };

export default function PurchasePage() {
  return <PurchaseClient />;
}
