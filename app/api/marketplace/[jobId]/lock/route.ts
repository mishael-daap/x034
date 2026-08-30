import { NextResponse } from "next/server";
import { finalizeJobLock } from "@/lib/lock";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ jobId: string }> };

/** POST /api/marketplace/[jobId]/lock — lock the job at start (idempotent). */
export async function POST(_req: Request, { params }: Params) {
  const { jobId } = await params;
  const result = await finalizeJobLock(jobId);

  if (result.error) return json(400, { error: result.error });
  if (result.not_started) return json(409, { error: "Job has not started yet" });
  return json(200, result);
}
