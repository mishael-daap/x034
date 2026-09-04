import { NodesClient } from "@/components/nodes/nodes-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "My nodes" };

export default function NodesPage() {
  return <NodesClient />;
}
