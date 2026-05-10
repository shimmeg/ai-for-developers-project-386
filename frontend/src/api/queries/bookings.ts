import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import type { components } from '../types';
import { slotsKeys } from './slots';

export type Booking = components['schemas']['Booking'];
export type BookingCreate = components['schemas']['BookingCreate'];

export type CreateBookingInput = {
  slug: string;
  body: BookingCreate;
};

export type BookingFailure =
  | { kind: 'conflict'; message: string }
  | { kind: 'notFound'; message: string }
  | { kind: 'badRequest'; message: string }
  | { kind: 'other'; message: string };

class BookingError extends Error {
  failure: BookingFailure;
  constructor(failure: BookingFailure) {
    super(failure.message);
    this.failure = failure;
  }
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation<Booking, BookingError, CreateBookingInput>({
    mutationFn: async ({ slug, body }) => {
      const { data, error, response } = await apiClient.POST('/event-types/{slug}/bookings', {
        params: { path: { slug } },
        body,
      });
      if (error) {
        const message = error.message ?? 'Booking failed';
        if (response.status === 409) throw new BookingError({ kind: 'conflict', message });
        if (response.status === 404) throw new BookingError({ kind: 'notFound', message });
        if (response.status === 400) throw new BookingError({ kind: 'badRequest', message });
        throw new BookingError({ kind: 'other', message });
      }
      if (!data) throw new BookingError({ kind: 'other', message: 'Empty booking response' });
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: slotsKeys.forSlug(variables.slug) });
    },
    onError: (error, variables) => {
      // 409 (slot taken / event type just became inactive) and 404 (event type
      // gone) both mean the slot picker is now stale — invalidate so the next
      // visit re-fetches instead of showing the user the slot they just lost.
      if (error.failure.kind === 'conflict' || error.failure.kind === 'notFound') {
        queryClient.invalidateQueries({ queryKey: slotsKeys.forSlug(variables.slug) });
      }
    },
  });
}
