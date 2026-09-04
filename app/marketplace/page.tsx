import { MarketplaceClient } from "@/components/marketplace/marketplace-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Marketplace" };

export default function MarketplacePage() {
  return <MarketplaceClient />;
}
