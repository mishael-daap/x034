import { supabaseFetch } from "@/lib/supabase";
import { isTestMode, paystackListBanks, type PaystackBank } from "@/lib/paystack";

// Bank catalogue (roadmap 6). Paystack is the source of truth; the local
// `banks` table is the read model the profile picker uses, refreshed daily.
// Keeping it local means profile loads never depend on Paystack being up and
// the paginated sandbox resolve quota is never touched by browsing.

const SYNCED_AT_KEY = "banks_synced_at";
const SYNC_TTL_MS = 24 * 60 * 60 * 1000;

export type BankOption = { id: string; name: string; code: string };
type BankRow = BankOption & { is_test: boolean };

// Sandbox keys can't resolve live accounts (3/day) — see lib/banks.ts notes.
export { isTestMode };

function usable(bank: PaystackBank): boolean {
  return (
    Boolean(bank.code) &&
    bank.currency === "NGN" &&
    bank.type === "nuban" &&
    bank.supports_transfer &&
    bank.active &&
    !bank.is_deleted
  );
}

/**
 * Fetch the Paystack catalogue and upsert it into `banks` by name. Transfer-
 * capable NGN NUBAN banks only — a bank that can't receive transfers must not
 * appear in the picker. Existing rows are updated, never duplicated.
 */
export async function syncBanks(): Promise<{ synced: number } | { error: string }> {
  let catalogue: PaystackBank[];
  try {
    catalogue = await paystackListBanks();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reach Paystack" };
  }

  // Paystack lists 5 codes twice (same bank, two names); `code` is unique
  // locally, so first occurrence wins.
  const seenNames = new Set<string>();
  const seenCodes = new Set<string>();
  const rows: { name: string; code: string; currency: string }[] = [];
  for (const bank of catalogue) {
    if (!usable(bank) || seenNames.has(bank.name) || seenCodes.has(bank.code)) continue;
    seenNames.add(bank.name);
    seenCodes.add(bank.code);
    rows.push({ name: bank.name, code: bank.code, currency: "NGN" });
  }
  if (rows.length === 0) return { error: "Paystack returned no transfer-capable banks" };

  const res = await supabaseFetch(`/rest/v1/banks?on_conflict=name`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (res.status >= 400) return { error: res.error ?? "Could not save the bank catalogue" };

  await supabaseFetch(`/rest/v1/app_settings?on_conflict=key`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ key: SYNCED_AT_KEY, value: new Date().toISOString() }),
  });

  return { synced: rows.length };
}

async function readCodedBanks(): Promise<BankRow[]> {
  const res = await supabaseFetch<BankRow[]>(
    `/rest/v1/banks?select=id,name,code,is_test&code=not.is.null&order=name`
  );
  return res.status === 200 ? (res.data ?? []) : [];
}

async function lastSyncedAt(): Promise<number | null> {
  const res = await supabaseFetch<{ value: unknown }[]>(
    `/rest/v1/app_settings?key=eq.${SYNCED_AT_KEY}&limit=1`
  );
  const value = res.status === 200 ? res.data?.[0]?.value : null;
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function visible(rows: BankRow[]): BankOption[] {
  const test = isTestMode();
  return rows
    .filter((b) => (b.is_test ? test : true))
    .map((b) => ({ id: b.id, name: b.name, code: b.code }));
}

/**
 * The picker's bank list. Syncs when the catalogue is empty or older than 24 h
 * (best effort — a Paystack outage falls back to whatever is already stored).
 * The sandbox "Test Bank" row is only visible with an sk_test_ key.
 */
export async function listBanks(): Promise<BankOption[]> {
  let rows = await readCodedBanks();

  if (rows.length === 0) {
    await syncBanks();
    rows = await readCodedBanks();
  } else {
    const syncedAt = await lastSyncedAt();
    if (syncedAt === null || Date.now() - syncedAt > SYNC_TTL_MS) {
      await syncBanks();
      rows = await readCodedBanks();
    }
  }

  return visible(rows);
}
