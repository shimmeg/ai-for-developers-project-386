import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import type { components } from '../types';
import { HttpError, toHttpError } from '../../lib/httpError';

export type SlotPickerResponse = components['schemas']['SlotPickerResponse'];
export type DaySlots = components['schemas']['DaySlots'];
export type DayStatus = components['schemas']['DayStatus'];

export const slotsKeys = {
  all: ['slots'] as const,
  forSlug: (slug: string) => [...slotsKeys.all, slug] as const,
};

export function useSlots(slug: string) {
  return useQuery<SlotPickerResponse, HttpError>({
    queryKey: slotsKeys.forSlug(slug),
    staleTime: 0,
    queryFn: async () => {
      const res = await apiClient.GET('/event-types/{slug}/slots', {
        params: { path: { slug } },
      });
      if (res.error) throw toHttpError(res.error, res.response, 'Failed to load slots');
      if (!res.data) throw new HttpError(0, 'empty_response', 'Empty slots response');
      return res.data;
    },
  });
}
