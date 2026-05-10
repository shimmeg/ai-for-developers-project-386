import { z } from 'zod';
import type { components } from '../../api/types';

const Slug = z
  .string()
  .min(1, 'Slug is required')
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, digits, and hyphens only');

export const EventTypeFormSchema = z.object({
  slug: Slug,
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().min(1, 'Description is required').max(2000),
  durationMinutes: z
    .number()
    .int('Use whole minutes')
    .min(1, 'Must be at least 1 minute')
    .max(60 * 24, 'Must be 24 hours or less'),
});

export type EventTypeFormValues = z.infer<typeof EventTypeFormSchema>;

const FIELDS: (keyof EventTypeFormValues)[] = ['slug', 'name', 'description', 'durationMinutes'];

export function diffEventType(
  before: EventTypeFormValues,
  after: EventTypeFormValues,
): components['schemas']['EventTypeUpdate'] {
  const out: components['schemas']['EventTypeUpdate'] = {};
  for (const k of FIELDS) {
    if (before[k] !== after[k]) {
      (out as Record<string, unknown>)[k] = after[k];
    }
  }
  return out;
}
