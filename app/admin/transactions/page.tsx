import { AdminTransactionsClient } from "@/components/admin/admin-transactions-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin · Transactions" };

export default function AdminTransactionsPage() {
  return <AdminTransactionsClient />;
}
