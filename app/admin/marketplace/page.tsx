import { AdminMarketplaceClient } from "@/components/admin/admin-marketplace-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin · Marketplace" };

export default function AdminMarketplacePage() {
  return <AdminMarketplaceClient />;
}
