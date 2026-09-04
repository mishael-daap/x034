import { MeClient } from "@/components/me/me-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Profile" };

export default function MePage() {
  return <MeClient />;
}
