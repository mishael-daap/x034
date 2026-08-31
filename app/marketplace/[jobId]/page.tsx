import { JobDetailClient } from "@/components/marketplace/job-detail-client";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <JobDetailClient jobId={jobId} />;
}
