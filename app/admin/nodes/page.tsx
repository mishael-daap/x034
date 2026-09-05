import { AdminNodesClient } from "@/components/admin/admin-nodes-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin · Nodes" };

export default function AdminNodesPage() {
  return <AdminNodesClient />;
}
