import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import type { components } from '../types';
import { slotsKeys } from './slots';
import { HttpError, toHttpError } from '../../lib/httpError';

export type Booking = components['schemas']['Booking'];
export type BookingCreate = components['schemas']['BookingCreate'];

export type CreateBookingInput = {
  slug: string;
  body: BookingCreate;
};

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation<Booking, HttpError, CreateBookingInput>({
    mutationFn: async ({ slug, body }) => {
      const res = await apiClient.POST('/event-types/{slug}/bookings', {
        params: { path: { slug } },
        body,
      });
      if (res.error) throw toHttpError(res.error, res.response, 'Booking failed');
      if (!res.data) throw new HttpError(0, 'empty_response', 'Empty booking response');
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: slotsKeys.forSlug(variables.slug) });
    },
    onError: (error, variables) => {
      // 409 (slot taken / event type just became inactive) and 404 (event type
      // gone) both mean the slot picker is now stale — invalidate so the next
      // visit re-fetches instead of showing the user the slot they just lost.
      if (error.status === 409 || error.status === 404) {
        queryClient.invalidateQueries({ queryKey: slotsKeys.forSlug(variables.slug) });
      }
    },
  });
}
