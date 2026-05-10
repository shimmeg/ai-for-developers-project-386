import { describe, expect, it } from 'vitest';
import { formatDayHeader, formatFullHuman, formatHourMinute } from '../lib/datetime';

// All assertions use a fixed offset and an IANA target zone, so the result must
// not depend on the runner's local TZ. The whole point of these helpers is to
// render in the *owner's* configured timezone, never the browser's.

describe('formatHourMinute', () => {
  it('renders the wall-clock hour:minute in the configured timezone', () => {
    // 10:00 in +03:00 == 07:00 UTC == 10:00 Europe/Moscow
    expect(formatHourMinute('2026-05-12T10:00:00+03:00', 'Europe/Moscow')).toBe('10:00');
    // …same instant rendered in New York is 03:00 EDT (UTC-4 in May)
    expect(formatHourMinute('2026-05-12T10:00:00+03:00', 'America/New_York')).toBe('03:00');
  });

  it('does not depend on the offset of the input string', () => {
    // Both ISO strings refer to the same instant; both must render identically
    // in the same target timezone.
    const tz = 'Europe/Moscow';
    expect(formatHourMinute('2026-05-12T07:00:00+00:00', tz)).toBe('10:00');
    expect(formatHourMinute('2026-05-12T10:00:00+03:00', tz)).toBe('10:00');
  });
});

describe('formatFullHuman', () => {
  it('produces a human date with the time portion joined by " at "', () => {
    const out = formatFullHuman('2026-05-12T10:00:00+03:00', 'Europe/Moscow');
    expect(out).toMatch(/Tuesday/);
    expect(out).toContain(' at ');
    expect(out).toContain('10:00');
  });

  it('renders the same instant differently in different IANA zones', () => {
    const moscow = formatFullHuman('2026-05-12T10:00:00+03:00', 'Europe/Moscow');
    const ny = formatFullHuman('2026-05-12T10:00:00+03:00', 'America/New_York');
    expect(moscow).not.toBe(ny);
    expect(ny).toContain('03:00');
  });
});

describe('formatDayHeader', () => {
  it('returns weekday + date for a calendar date string', () => {
    const { weekday, date } = formatDayHeader('2026-05-12');
    expect(weekday).toBe('Tue');
    expect(date).toBe('12 May');
  });

  it('treats the date as a wall calendar — no timezone shift', () => {
    expect(formatDayHeader('2026-05-09').date).toBe('9 May');
    expect(formatDayHeader('2026-12-31').date).toBe('31 Dec');
    expect(formatDayHeader('2026-01-01').weekday).toBe('Thu');
  });
});
