import { NextResponse } from "next/server";
import { listBanks } from "@/lib/banks";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/**
 * GET /api/banks — every bank Paystack can transfer to (NGN NUBAN only).
 * Read from the local catalogue, refreshed from Paystack when empty or stale.
 * In sandbox mode the list also carries "Test Bank (sandbox)" (code 001).
 */
export async function GET() {
  const banks = await listBanks();
  return json(200, { banks });
}
