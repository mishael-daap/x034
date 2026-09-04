import { JobDetailClient } from "@/components/marketplace/job-detail-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Job details" };

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <JobDetailClient jobId={jobId} />;
}
