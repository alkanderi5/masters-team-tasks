import type { TaskStatus } from './types';

/** Business timezone. Must match public.app_timezone() in the database. */
export const TZ = process.env.APP_TIMEZONE || 'Asia/Riyadh';
const LOCALE = 'en-GB';

const dtf = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, ...opts });

const fDate = dtf({ day: 'numeric', month: 'short', year: 'numeric' });
const fDateShort = dtf({ day: 'numeric', month: 'short' });
const fTime = dtf({ hour: 'numeric', minute: '2-digit', hour12: true });
const fMonth = dtf({ month: 'long', year: 'numeric' });
const fDay = dtf({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fKey = dtf({ year: 'numeric', month: '2-digit', day: '2-digit' });

export function formatDate(iso: string | null | undefined): string {
  return iso ? fDate.format(new Date(iso)) : '—';
}
export function formatTime(iso: string | null | undefined): string {
  return iso ? fTime.format(new Date(iso)).replace(/\s?(am|pm)$/i, (m) => ' ' + m.trim().toUpperCase()) : '—';
}
/** "8 Oct 2026 — 3:45 PM" */
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? `${formatDate(iso)} — ${formatTime(iso)}` : '—';
}
/** "8 Oct, 3:45 PM" (year omitted) */
export function formatShort(iso: string | null | undefined): string {
  return iso ? `${fDateShort.format(new Date(iso))}, ${formatTime(iso)}` : '—';
}
export function formatMonth(iso: string): string {
  return fMonth.format(new Date(iso));
}
export function formatLongDay(d: Date = new Date()): string {
  return fDay.format(d);
}
/** YYYY-MM-DD of a moment in the business timezone. */
/** "Good morning" / "Good afternoon" / "Good evening" in the business timezone. */
export function greeting(d: Date = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function localDateKey(d: Date | string = new Date()): string {
  const parts = fKey.formatToParts(typeof d === 'string' ? new Date(d) : d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Offset (ms) of TZ from UTC at a given instant. */
function tzOffsetMs(at: Date): number {
  const parts = dtf({
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - at.getTime();
}

/** UTC ISO string for 00:00 of a YYYY-MM-DD date in the business timezone. */
export function localDayStartISO(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - tzOffsetMs(guess)).toISOString();
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Human duration: "3 d 7 h", "5 h 20 m", "12 m". */
export function formatDuration(fromIso: string | null | undefined, toIso?: string | null): string {
  if (!fromIso) return '—';
  const ms = (toIso ? new Date(toIso) : new Date()).getTime() - new Date(fromIso).getTime();
  if (ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return hours ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return m ? `${hours} h ${m} m` : `${hours} h`;
  return `${Math.max(m, 1)} m`;
}

export function formatSecondsDuration(seconds: number): string {
  return formatDuration(new Date(0).toISOString(), new Date(seconds * 1000).toISOString());
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};

export function pct(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

/** Escape % and _ for PostgREST ilike patterns, and strip characters that break or() filters. */
export function ilikePattern(q: string): string {
  return '%' + q.replace(/[\\%_]/g, (c) => '\\' + c).replace(/[,()]/g, ' ').trim() + '%';
}

export function isUuid(v: string | undefined | null): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function isDateKey(v: string | undefined | null): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
