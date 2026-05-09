import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import type { components } from '../types';

export type SlotPickerResponse = components['schemas']['SlotPickerResponse'];
export type DaySlots = components['schemas']['DaySlots'];
export type DayStatus = components['schemas']['DayStatus'];

export const slotsKeys = {
  all: ['slots'] as const,
  forSlug: (slug: string) => [...slotsKeys.all, slug] as const,
};

export function useSlots(slug: string | undefined) {
  return useQuery({
    queryKey: slug ? slotsKeys.forSlug(slug) : slotsKeys.all,
    enabled: Boolean(slug),
    queryFn: async (): Promise<SlotPickerResponse> => {
      if (!slug) throw new Error('Missing event type slug');
      const { data, error } = await apiClient.GET('/event-types/{slug}/slots', {
        params: { path: { slug } },
      });
      if (error) throw error;
      if (!data) throw new Error('Empty slots response');
      return data;
    },
  });
}
