import { describe, expect, it } from 'vitest';
import { EventTypeFormSchema, diffEventType } from '../features/admin/event-type-schema';

const ok = {
  slug: 'intro-call',
  name: 'Intro call',
  description: 'A 30-minute chat.',
  durationMinutes: 30,
};

describe('EventTypeFormSchema', () => {
  it('accepts a canonical example', () => {
    expect(EventTypeFormSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects empty / spaced / uppercase slugs', () => {
    for (const slug of [
      '',
      'Intro Call',
      'INTRO',
      'intro_call',
      'intro--call',
      '-intro',
      'intro-',
    ]) {
      expect(EventTypeFormSchema.safeParse({ ...ok, slug }).success).toBe(false);
    }
  });

  it('rejects 0 / negative / non-integer / >24h duration', () => {
    for (const d of [0, -1, 1.5, 60 * 24 + 1]) {
      expect(EventTypeFormSchema.safeParse({ ...ok, durationMinutes: d }).success).toBe(false);
    }
  });

  it('rejects empty name / empty description', () => {
    expect(EventTypeFormSchema.safeParse({ ...ok, name: '' }).success).toBe(false);
    expect(EventTypeFormSchema.safeParse({ ...ok, name: '   ' }).success).toBe(false);
    expect(EventTypeFormSchema.safeParse({ ...ok, description: '' }).success).toBe(false);
  });
});

describe('diffEventType', () => {
  it('returns an empty object when nothing changed', () => {
    expect(diffEventType(ok, ok)).toEqual({});
  });

  it('includes only the changed fields', () => {
    expect(diffEventType(ok, { ...ok, name: 'New name' })).toEqual({
      name: 'New name',
    });
    expect(diffEventType(ok, { ...ok, slug: 'intro', durationMinutes: 45 })).toEqual({
      slug: 'intro',
      durationMinutes: 45,
    });
  });
});
