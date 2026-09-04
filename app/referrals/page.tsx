import { ReferralsClient } from "@/components/referrals/referrals-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Referrals" };

export default function ReferralsPage() {
  return <ReferralsClient />;
}
