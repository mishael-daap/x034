// Platform-level configuration (Phase 1, test currency).
// The earnings floor is a platform guarantee: no node owner should earn less
// than this for a completed job. It caps each job's pool size and is NOT
// shown to users. (A $20 pot admits up to 200 nodes at $0.10/node.)
export const PLATFORM_EARNINGS_FLOOR = 0.1;

// Nodes can't join a job's pool within this many hours before it starts.
export const COMMIT_WINDOW_HOURS = 1;

// Revenue & commission model: a node purchase (price P) debits the buyer's
// wallet in full; the referrer earns REFERRAL_COMMISSION_SHARE (3%) of P and
// the rest stays with the platform. Withdrawals: the user is paid
// WITHDRAWAL_PAYOUT_SHARE (90%) of an approved request and the platform keeps
// WITHDRAWAL_COMMISSION_SHARE (10%) in its own balance.
export const PLATFORM_USER_ID = "00000000-0000-4000-8000-000000000001";
export const REFERRAL_COMMISSION_SHARE = 0.03;
export const WITHDRAWAL_COMMISSION_SHARE = 0.1;
export const WITHDRAWAL_PAYOUT_SHARE = 1 - WITHDRAWAL_COMMISSION_SHARE;

// Paystack node payments (roadmap 5): prices are USD; Paystack charges NGN at
// this fixed sandbox rate. Charged kobo = round(price × USD_TO_NGN × 100).
// A live rate lookup is deferred — this is test-mode plumbing for now.
export const USD_TO_NGN = 1400;
export const PAYSTACK_API = "https://api.paystack.co";
