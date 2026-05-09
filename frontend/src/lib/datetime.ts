// Time formatting helpers that always render in a given IANA timezone, never
// in the browser's local timezone. Built on Intl.DateTimeFormat so we don't
// need to pull in dayjs's utc/timezone plugins.

const HOUR_MINUTE: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

const FULL_HUMAN: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

const DAY_HEADER_WEEKDAY: Intl.DateTimeFormatOptions = { weekday: 'short' };
const DAY_HEADER_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

function formatter(opts: Intl.DateTimeFormatOptions, timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: timezone });
}

export function formatHourMinute(iso: string, timezone: string): string {
  return formatter(HOUR_MINUTE, timezone).format(new Date(iso));
}

export function formatFullHuman(iso: string, timezone: string): string {
  // Intl en-GB formats as "Tuesday, 12 May 2026, 10:00"; replace the last
  // ", " (which separates date from time) with " at " for natural English.
  const out = formatter(FULL_HUMAN, timezone).format(new Date(iso));
  const i = out.lastIndexOf(', ');
  if (i === -1) return out;
  return `${out.slice(0, i)} at ${out.slice(i + 2)}`;
}

export function formatDayHeader(isoDate: string): { weekday: string; date: string } {
  // isoDate is a calendar date in the owner's configured timezone (per the
  // contract). Render it as a date — no instant math, no timezone shift.
  const [y, m, d] = isoDate.split('-').map(Number);
  const utcAnchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return {
    weekday: new Intl.DateTimeFormat('en-GB', {
      ...DAY_HEADER_WEEKDAY,
      timeZone: 'UTC',
    }).format(utcAnchor),
    date: new Intl.DateTimeFormat('en-GB', {
      ...DAY_HEADER_DATE,
      timeZone: 'UTC',
    }).format(utcAnchor),
  };
}
