// Shared input validation (client + server). Each function returns an error
// message, or null when the value is acceptable.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}\p{M}' .-]+$/u;
// Nigerian mobile numbers: 0801 234 5678, 08012345678, +2348012345678 …
const PHONE_RE = /^(\+?234|0)?[789][01]\d{8}$/;
const PASSWORD_RE = /(?=.*[A-Za-z])(?=.*\d)/;
const NUBAN_RE = /^\d{10}$/;
const NODE_CODE_RE = /^[A-Z0-9]{1,8}$/;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

export const MONEY_MIN = 0.01;
export const MONEY_MAX = 100_000;

export function nameError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Enter your full name";
  if (v.length < 2) return "Name is too short";
  if (v.length > 60) return "Name must be 60 characters or fewer";
  if (!NAME_RE.test(v)) return "Use letters, spaces, hyphens or apostrophes only";
  return null;
}

export function emailError(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v) return "Enter your email address";
  if (v.length > 254 || !EMAIL_RE.test(v)) return "Enter a valid email address";
  return null;
}

export function phoneError(raw: string): string | null {
  const v = raw.trim().replace(/[\s()-]/g, "");
  if (!v) return "Enter your phone number";
  if (!PHONE_RE.test(v))
    return "Enter a valid phone number, e.g. 08012345678 or +2348012345678";
  return null;
}

export function passwordError(raw: string): string | null {
  if (!raw) return "Enter a password";
  if (raw.length < 8) return "Password must be at least 8 characters";
  if (!PASSWORD_RE.test(raw)) return "Password must include letters and numbers";
  return null;
}

export function accountNumberError(
  raw: string,
  opts: { required?: boolean } = {}
): string | null {
  const v = raw.trim();
  if (!v) return opts.required ? "Enter your account number" : null;
  if (!NUBAN_RE.test(v)) return "Account numbers are 10 digits";
  return null;
}

export function nodeCodeError(raw: string): string | null {
  const v = raw.trim().toUpperCase();
  if (!v) return "Enter a code";
  if (!NODE_CODE_RE.test(v)) return "1–8 letters or numbers (no spaces)";
  return null;
}

/** Short product/label names (tier names, titles): 1–40 chars, single line. */
export function shortLabelError(raw: string, label: string): string | null {
  const v = raw.trim();
  if (!v) return `Enter the ${label.toLowerCase()}`;
  if (v.length > 40) return `${label} must be 40 characters or fewer`;
  if (/[\n\r]/.test(v)) return `${label} must be a single line`;
  return null;
}

/** Optional referral code — light format check only (validity is server-side). */
export function referralCodeError(raw: string): string | null {
  const v = raw.trim().toUpperCase();
  if (!v) return null;
  if (!/^[A-Z0-9]{6,10}$/.test(v))
    return "Referral codes are 6–10 letters/numbers — check it was shared correctly";
  return null;
}

export function requiredSelectError(label: string, value: string): string | null {
  return value ? null : `Select ${label}`;
}

/** Money amounts (USD shown in the app): positive, ≤2 decimals, sane bounds. */
export function moneyError(
  raw: string,
  opts: { label?: string; min?: number; max?: number } = {}
): string | null {
  const label = opts.label ?? "Amount";
  const min = opts.min ?? MONEY_MIN;
  const max = opts.max ?? MONEY_MAX;
  const v = raw.trim();
  if (!v) return `Enter an amount`;
  if (!/^\d+(\.\d+)?$/.test(v)) return `${label} must be a number`;
  if (!MONEY_RE.test(v)) return `${label} can have up to 2 decimal places`;
  const n = Number(v);
  if (!Number.isFinite(n)) return `Enter a valid amount`;
  if (n < min) return `${label} must be at least ${min.toFixed(2)}`;
  if (n > max) return `${label} is too large`;
  return null;
}

export function wholeNumberError(
  raw: string,
  opts: { label: string; min?: number; max?: number; required?: boolean }
): string | null {
  const v = raw.trim();
  if (!v) return opts.required === false ? null : `Enter the ${opts.label.toLowerCase()}`;
  if (!/^\d+$/.test(v)) return `${opts.label} must be a whole number`;
  const n = Number(v);
  const min = opts.min ?? 0;
  const max = opts.max ?? Number.MAX_SAFE_INTEGER;
  if (n < min) return `${opts.label} must be at least ${min}`;
  if (n > max) return `${opts.label} is too large`;
  return null;
}

export function decimalError(
  raw: string,
  opts: { label: string; min: number; max: number }
): string | null {
  const v = raw.trim();
  if (!v) return `Enter the ${opts.label.toLowerCase()}`;
  if (!/^\d+(\.\d+)?$/.test(v)) return `${opts.label} must be a number`;
  const n = Number(v);
  if (!Number.isFinite(n)) return `Enter a valid ${opts.label.toLowerCase()}`;
  if (n < opts.min) return `${opts.label} must be at least ${opts.min}`;
  if (n > opts.max) return `${opts.label} is too large`;
  return null;
}

/** Starts-at date-time: required and must be in the future. */
export function startsAtError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Pick a start time";
  const t = Date.parse(v);
  if (Number.isNaN(t)) return "Pick a valid date and time";
  if (t <= Date.now()) return "Start time must be in the future";
  return null;
}

/**
 * Reject naive date-times (no UTC offset). A bare "2026-09-06T14:30" is a
 * local wall-clock value — parsed on a UTC server it shifts by the admin's
 * whole UTC offset (the "starts 1h late" bug). The UI converts the
 * datetime-local picker to an offset ISO before sending, so anything naive
 * arriving here is a stale client or a direct API call: fail loudly instead
 * of silently storing the wrong instant.
 */
export function timezoneIsoError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  return /(Z|[+-]\d{2}:?\d{2})$/i.test(v)
    ? null
    : "Send a timezone-aware ISO time (ends in Z or ±HH:MM)";
}

/** Whole-number helpers with sane domain caps (imported by callers when needed). */
export const JOB_PAYOUT_MIN = 0.1;
export const JOB_PAYOUT_MAX = 1_000_000;
export const JOB_DURATION_MIN = 0.1;
export const JOB_DURATION_MAX = 24 * 30; // up to 30 days
