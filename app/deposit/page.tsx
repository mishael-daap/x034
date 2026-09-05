import { DepositClient } from "@/components/deposit/deposit-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Deposit" };

export default function DepositPage() {
  return <DepositClient />;
}
