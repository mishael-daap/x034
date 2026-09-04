import { AdminWithdrawalsClient } from "@/components/admin/admin-withdrawals-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin withdrawals" };

export default function AdminWithdrawalsPage() {
  return <AdminWithdrawalsClient />;
}
