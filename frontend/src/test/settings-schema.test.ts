import { describe, expect, it } from 'vitest';
import { SettingsFormSchema, normalizeSettings } from '../features/admin/settings-schema';

const okValues = {
  timezone: 'Europe/Moscow',
  workingHours: {
    monday: { status: 'open', start: '09:00', end: '18:00' },
    tuesday: { status: 'open', start: '09:00', end: '18:00' },
    wednesday: { status: 'open', start: '09:00', end: '18:00' },
    thursday: { status: 'open', start: '09:00', end: '18:00' },
    friday: { status: 'open', start: '09:00', end: '17:00' },
    saturday: { status: 'closed' },
    sunday: { status: 'closed' },
  },
} as const;

describe('SettingsFormSchema', () => {
  it('accepts valid values', () => {
    const result = SettingsFormSchema.safeParse(okValues);
    expect(result.success).toBe(true);
  });

  it('rejects an unknown timezone', () => {
    const bad = { ...okValues, timezone: 'Mars/Olympus_Mons' };
    expect(SettingsFormSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects end <= start on an open day', () => {
    const bad = {
      ...okValues,
      workingHours: {
        ...okValues.workingHours,
        monday: { status: 'open', start: '18:00', end: '09:00' },
      },
    } as typeof okValues;
    expect(SettingsFormSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects extraneous start/end on a closed day', () => {
    const bad = {
      ...okValues,
      workingHours: {
        ...okValues.workingHours,
        // @ts-expect-error testing strictness against extra fields
        saturday: { status: 'closed', start: '09:00', end: '18:00' },
      },
    };
    expect(SettingsFormSchema.safeParse(bad).success).toBe(false);
  });
});

describe('normalizeSettings', () => {
  it('drops start/end from closed days even if the form holds them', () => {
    const formValues = {
      timezone: 'Europe/Moscow',
      workingHours: {
        ...okValues.workingHours,
        saturday: { status: 'closed', start: '09:00', end: '18:00' },
      },
    } as never;
    const out = normalizeSettings(formValues);
    expect(out.workingHours.saturday).toEqual({ status: 'closed' });
  });

  it('preserves open day fields', () => {
    const out = normalizeSettings(okValues as never);
    expect(out.workingHours.monday).toEqual({ status: 'open', start: '09:00', end: '18:00' });
    expect(out.timezone).toBe('Europe/Moscow');
  });
});
