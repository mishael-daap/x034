import { DepositClient } from "@/components/deposit/deposit-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Deposit" };

export default async function DepositPage({
  searchParams,
}: {
  searchParams: Promise<{ amount?: string }>;
}) {
  const params = await searchParams;
  const amount = params.amount ? Number(params.amount) : null;
  return <DepositClient prefillAmount={Number.isFinite(amount) ? amount : null} />;
}
