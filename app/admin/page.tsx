import { AdminDashboardClient } from "@/components/admin/admin-dashboard-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin dashboard" };

export default function AdminPage() {
  return <AdminDashboardClient />;
}
