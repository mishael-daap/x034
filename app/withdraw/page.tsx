import { WithdrawClient } from "@/components/withdraw/withdraw-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Withdraw" };

export default function WithdrawPage() {
  return <WithdrawClient />;
}
