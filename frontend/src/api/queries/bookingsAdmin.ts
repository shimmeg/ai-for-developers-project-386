import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminClient } from '../adminClient';
import type { components } from '../types';
import { HttpError, toHttpError } from '../../lib/httpError';

export type Booking = components['schemas']['Booking'];

export const bookingsAdminKeys = {
  all: ['admin', 'bookings'] as const,
};

function isHttp4xx(err: unknown): boolean {
  return err instanceof HttpError && err.status >= 400 && err.status < 500;
}

export function useAdminBookings() {
  return useQuery<Booking[], HttpError>({
    queryKey: bookingsAdminKeys.all,
    retry: (count, err) => (isHttp4xx(err) ? false : count < 1),
    queryFn: async () => {
      const res = await adminClient.GET('/admin/bookings');
      if (res.error) throw toHttpError(res.error, res.response);
      return res.data;
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation<void, HttpError, { id: string }, { previous?: Booking[] }>({
    retry: false,
    mutationFn: async ({ id }) => {
      const res = await adminClient.DELETE('/admin/bookings/{id}', {
        params: { path: { id } },
      });
      if (res.error) throw toHttpError(res.error, res.response, 'Cancel failed');
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: bookingsAdminKeys.all });
      const previous = queryClient.getQueryData<Booking[]>(bookingsAdminKeys.all);
      if (previous) {
        queryClient.setQueryData<Booking[]>(
          bookingsAdminKeys.all,
          previous.filter((b) => b.id !== id),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(bookingsAdminKeys.all, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: bookingsAdminKeys.all });
    },
  });
}
