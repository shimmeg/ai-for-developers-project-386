import { z } from 'zod';
import type { components } from '../../api/types';
import { getSupportedTimezones } from '../../lib/timezones';

const SUPPORTED_TIMEZONES = new Set<string>(getSupportedTimezones());

const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');

const ClosedDay = z.strictObject({ status: z.literal('closed') });
const OpenDay = z
  .strictObject({ status: z.literal('open'), start: Hhmm, end: Hhmm })
  .refine((d) => d.end > d.start, { message: 'End must be after start', path: ['end'] });

const WorkingDay = z.discriminatedUnion('status', [ClosedDay, OpenDay]);

export const SettingsFormSchema = z.object({
  timezone: z
    .string()
    .min(1, 'Timezone is required')
    .refine((v) => SUPPORTED_TIMEZONES.has(v), 'Pick a recognised IANA timezone'),
  workingHours: z.object({
    monday: WorkingDay,
    tuesday: WorkingDay,
    wednesday: WorkingDay,
    thursday: WorkingDay,
    friday: WorkingDay,
    saturday: WorkingDay,
    sunday: WorkingDay,
  }),
});

export type SettingsFormValues = z.infer<typeof SettingsFormSchema>;

type DayKey = keyof SettingsFormValues['workingHours'];
const DAY_KEYS: DayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export function normalizeSettings(
  values: SettingsFormValues,
): components['schemas']['OwnerSettings'] {
  const wh = {} as components['schemas']['OwnerSettings']['workingHours'];
  for (const k of DAY_KEYS) {
    const day = values.workingHours[k];
    if (day.status === 'closed') {
      wh[k] = { status: 'closed' };
    } else {
      wh[k] = { status: 'open', start: day.start, end: day.end };
    }
  }
  return { timezone: values.timezone, workingHours: wh };
}
