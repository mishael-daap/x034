// Withdrawal windows — when users are allowed to request a withdrawal.
// The admin controls this on /admin → Transactions → Method. The policy is
// stored as JSON in app_settings under the key `withdrawal_policy`, so absent
// settings keep the historical behaviour (withdrawals open any time).
//
// Modes:
//   open       — always allow
//   disabled   — never allow; its message explains why
//   scheduled  — allow every day between two dates, inside a daily time window
//   recurring  — allow on matching days (e.g. every Friday, every 2 months)
//                between two dates, inside a daily time window
//
// Dates and daily times are interpreted in UTC. Each closed mode carries its
// own popup message so the copy matches the specific withdrawal window.

export type WithdrawalPolicyMode = "open" | "scheduled" | "recurring" | "disabled";
export type WithdrawalRecurrence = "weekly" | "monthly";
export type WithdrawalMessageMode = "scheduled" | "recurring" | "disabled";

export type WithdrawalMessages = Record<WithdrawalMessageMode, string>;

export type WithdrawalPolicy = {
  mode: WithdrawalPolicyMode;
  /** Per-mode popup copy shown to users when that mode blocks a withdrawal. */
  messages: WithdrawalMessages;
  // Recurring rules
  recurrence: WithdrawalRecurrence;
  /** every N weeks / N months (>= 1) */
  interval: number;
  /** weekly: 0=Sun … 6=Sat; empty = the boundary start's weekday */
  weekdays: number[];
  /** monthly: 1..31; empty = the boundary start's day of month */
  month_days: number[];
  // Date boundary (UTC days) for scheduled + recurring
  boundary_start: string | null;
  boundary_end: string | null;
  // Daily time window (UTC "HH:MM") for scheduled + recurring
  day_start: string;
  day_end: string;
};

export type WithdrawalPolicyState = {
  mode: WithdrawalPolicyMode;
  open: boolean;
  message: string;
  day_start: string;
  day_end: string;
  /** ISO instant of the next opening, or null when there isn't one. */
  next_open: string | null;
};

export const DEFAULT_WITHDRAWAL_MESSAGES: WithdrawalMessages = {
  scheduled: "Withdrawals are only available during the scheduled window.",
  recurring: "Withdrawals are only available on scheduled days. Please check back later.",
  disabled: "Withdrawals are currently unavailable. Please check back later.",
};

export const DEFAULT_WITHDRAWAL_POLICY: WithdrawalPolicy = {
  mode: "open",
  messages: { ...DEFAULT_WITHDRAWAL_MESSAGES },
  recurrence: "weekly",
  interval: 1,
  weekdays: [],
  month_days: [],
  boundary_start: null,
  boundary_end: null,
  day_start: "00:00",
  day_end: "23:59",
};

const DAY_MS = 86_400_000;
const MAX_MESSAGE = 500;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MODES: WithdrawalPolicyMode[] = ["open", "scheduled", "recurring", "disabled"];
const MESSAGE_MODES: WithdrawalMessageMode[] = ["scheduled", "recurring", "disabled"];

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeTime(v: unknown, fallback: string): string {
  if (typeof v === "string") {
    const m = v.trim().match(TIME_RE);
    if (m) return `${m[1]}:${m[2]}`;
  }
  return fallback;
}

function utcHHMM(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function parseNumberArray(v: unknown, min: number, max: number): number[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<number>();
  for (const item of v) {
    const n = Number(item);
    if (Number.isInteger(n) && n >= min && n <= max) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)
  );
}

function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  s.setUTCDate(s.getUTCDate() - s.getUTCDay()); // Sunday (UTC)
  return s;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Start/end instants of a day's daily window (UTC). */
function windowStartMs(day: Date, dayStart: string): number {
  return day.getTime() + minutesOf(dayStart) * 60_000;
}

function windowEndMs(day: Date, dayEnd: string): number {
  return day.getTime() + minutesOf(dayEnd) * 60_000;
}

/** Normalize any stored/raw value into a fully-populated policy object. */
export function normalizeWithdrawalPolicy(raw: unknown): WithdrawalPolicy {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const mode: WithdrawalPolicyMode = MODES.includes(o.mode as WithdrawalPolicyMode)
    ? (o.mode as WithdrawalPolicyMode)
    : "open";

  // Legacy single `message` acted as the copy for whatever mode was active.
  const legacyMessage =
    typeof o.message === "string" && o.message.trim()
      ? o.message.trim().slice(0, MAX_MESSAGE)
      : null;
  const rawMessages = (
    o.messages && typeof o.messages === "object" ? o.messages : {}
  ) as Record<string, unknown>;
  const messages = { ...DEFAULT_WITHDRAWAL_MESSAGES };
  for (const m of MESSAGE_MODES) {
    const value = rawMessages[m];
    if (typeof value === "string" && value.trim()) {
      messages[m] = value.trim().slice(0, MAX_MESSAGE);
    } else if (legacyMessage) {
      messages[m] = legacyMessage;
    }
  }

  const recurrence: WithdrawalRecurrence =
    o.recurrence === "monthly" ? "monthly" : "weekly";

  const intervalRaw = Number(o.interval);
  const interval =
    Number.isFinite(intervalRaw) && intervalRaw >= 1
      ? Math.min(Math.floor(intervalRaw), 60)
      : 1;

  // Legacy scheduled_start/scheduled_end were exact instants; reuse their date
  // and time-of-day so older settings still behave sensibly.
  const legacyStart = parseDate(o.scheduled_start);
  const legacyEnd = parseDate(o.scheduled_end);
  const boundaryStart = parseDate(o.boundary_start) ?? legacyStart;
  const boundaryEnd = parseDate(o.boundary_end) ?? legacyEnd;

  return {
    mode,
    messages,
    recurrence,
    interval,
    weekdays: parseNumberArray(o.weekdays, 0, 6),
    month_days: parseNumberArray(o.month_days, 1, 31),
    boundary_start: boundaryStart ? startOfDay(boundaryStart).toISOString() : null,
    boundary_end: boundaryEnd ? startOfDay(boundaryEnd).toISOString() : null,
    day_start: normalizeTime(o.day_start, legacyStart ? utcHHMM(legacyStart) : "00:00"),
    day_end: normalizeTime(o.day_end, legacyEnd ? utcHHMM(legacyEnd) : "23:59"),
  };
}

/** Which weekdays/month-days a recurring policy matches. Empty = boundary start. */
export function effectiveRecurrenceDays(
  policy: WithdrawalPolicy,
  boundaryStart: Date
): { weekdays: number[]; monthDays: number[] } {
  return {
    weekdays: policy.weekdays.length ? policy.weekdays : [boundaryStart.getUTCDay()],
    monthDays: policy.month_days.length ? policy.month_days : [boundaryStart.getUTCDate()],
  };
}

function matchesRecurrence(
  policy: WithdrawalPolicy,
  day: Date,
  boundaryStart: Date,
  boundaryEnd: Date
): boolean {
  const d = startOfDay(day);
  if (d.getTime() < boundaryStart.getTime() || d.getTime() > boundaryEnd.getTime()) {
    return false;
  }

  const { weekdays, monthDays } = effectiveRecurrenceDays(policy, boundaryStart);

  if (policy.recurrence === "weekly") {
    if (!weekdays.includes(d.getUTCDay())) return false;
    const weeks = Math.round(
      (startOfWeek(d).getTime() - startOfWeek(boundaryStart).getTime()) / (7 * DAY_MS)
    );
    return weeks >= 0 && weeks % policy.interval === 0;
  }

  // monthly
  if (!monthDays.includes(d.getUTCDate())) return false;
  const months =
    (d.getUTCFullYear() - boundaryStart.getUTCFullYear()) * 12 +
    (d.getUTCMonth() - boundaryStart.getUTCMonth());
  return months >= 0 && months % policy.interval === 0;
}

function withinDailyWindow(policy: WithdrawalPolicy, now: number): boolean {
  const d = new Date(now);
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= minutesOf(policy.day_start) && mins <= minutesOf(policy.day_end);
}

/** Whether a withdrawal is allowed right now. */
export function isWithdrawalOpen(
  policy: WithdrawalPolicy,
  now: number = Date.now()
): boolean {
  if (policy.mode === "open") return true;
  if (policy.mode === "disabled") return false;

  const bs = parseDate(policy.boundary_start);
  const be = parseDate(policy.boundary_end);
  if (!bs || !be) return false;
  const boundaryStart = startOfDay(bs);
  const boundaryEnd = endOfDay(be);
  if (now < boundaryStart.getTime() || now > boundaryEnd.getTime()) return false;

  if (
    policy.mode === "recurring" &&
    !matchesRecurrence(policy, new Date(now), boundaryStart, boundaryEnd)
  ) {
    return false;
  }

  return withinDailyWindow(policy, now);
}

/** The next instant withdrawals open, or null when none is scheduled. */
export function nextWithdrawalOpening(
  policy: WithdrawalPolicy,
  now: number = Date.now()
): Date | null {
  if (policy.mode === "open" || policy.mode === "disabled") return null;

  const bs = parseDate(policy.boundary_start);
  const be = parseDate(policy.boundary_end);
  if (!bs || !be) return null;
  const boundaryStart = startOfDay(bs);
  const boundaryEnd = endOfDay(be);
  if (now > boundaryEnd.getTime()) return null;

  let day = startOfDay(new Date(Math.max(now, boundaryStart.getTime())));
  // Search up to ~2 years ahead; enough for any sane interval.
  for (let i = 0; i < 800; i++) {
    if (day.getTime() > boundaryEnd.getTime()) return null;
    const matches =
      policy.mode === "scheduled"
        ? true
        : matchesRecurrence(policy, day, boundaryStart, boundaryEnd);
    if (matches) {
      const ws = windowStartMs(day, policy.day_start);
      const we = windowEndMs(day, policy.day_end);
      if (now < ws) return new Date(ws);
      if (now <= we) return null; // open now
    }
    day = addDays(day, 1);
  }
  return null;
}

/** Serialisable state handed to the user-facing withdraw page. */
export function withdrawalPolicyState(
  policy: WithdrawalPolicy,
  now: number = Date.now()
): WithdrawalPolicyState {
  const open = isWithdrawalOpen(policy, now);
  const next = open ? null : nextWithdrawalOpening(policy, now);
  const message =
    policy.mode === "open"
      ? ""
      : policy.messages[policy.mode as WithdrawalMessageMode] ||
        DEFAULT_WITHDRAWAL_MESSAGES.disabled;
  return {
    mode: policy.mode,
    open,
    message,
    day_start: policy.day_start,
    day_end: policy.day_end,
    next_open: next ? next.toISOString() : null,
  };
}

/** Human label for a recurrence (used in the admin summary). */
export function recurrenceLabel(policy: WithdrawalPolicy): string {
  const unit = policy.recurrence === "weekly" ? "week" : "month";
  const every = policy.interval === 1 ? `Every ${unit}` : `Every ${policy.interval} ${unit}s`;
  const { weekdays, monthDays } = effectiveRecurrenceDays(
    policy,
    policy.boundary_start ? new Date(policy.boundary_start) : new Date()
  );
  if (policy.recurrence === "weekly") {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const days = weekdays.map((d) => names[d] ?? "").filter(Boolean);
    return days.length ? `${every} on ${days.join(", ")}` : every;
  }
  const days = monthDays.join(", ");
  return days ? `${every} on day ${days}` : every;
}
