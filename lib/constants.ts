// Platform-level configuration (Phase 1, test currency).
// The earnings floor is a platform guarantee: no node owner should earn less
// than this for a completed job. It caps each job's pool size and is NOT
// shown to users.
export const PLATFORM_EARNINGS_FLOOR = 1.0;

// Nodes can't join a job's pool within this many hours before it starts.
export const COMMIT_WINDOW_HOURS = 1;

// Revenue & commission model: the platform is a seeded users row (migration 0006)
// and every node purchase (price P) is split across the ledger:
//   referrer `referral` +0.3P (only when the buyer has a referrer)
//   platform `node_sale` +0.5P and `platform_earnings` +0.2P (+0.5P with no referrer)
export const PLATFORM_USER_ID = "00000000-0000-4000-8000-000000000001";
export const NODE_SALE_SHARE = 0.5;
export const PLATFORM_CUT_SHARE = 0.2;
export const REFERRAL_COMMISSION_SHARE = 0.3;

// Paystack node payments (roadmap 5): prices are USD; Paystack charges NGN at
// this fixed sandbox rate. Charged kobo = round(price × USD_TO_NGN × 100).
// A live rate lookup is deferred — this is test-mode plumbing for now.
export const USD_TO_NGN = 1400;
export const PAYSTACK_API = "https://api.paystack.co";
