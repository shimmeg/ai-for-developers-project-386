import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminClient } from '../adminClient';
import type { components } from '../types';
import { HttpError, toHttpError } from '../../lib/httpError';

export type EventType = components['schemas']['EventType'];
export type EventTypeCreate = components['schemas']['EventTypeCreate'];
export type EventTypeUpdate = components['schemas']['EventTypeUpdate'];

export const eventTypesAdminKeys = {
  all: ['admin', 'event-types'] as const,
};

function isHttp4xx(err: unknown): boolean {
  return err instanceof HttpError && err.status >= 400 && err.status < 500;
}

export function useAdminEventTypes() {
  return useQuery<EventType[], HttpError>({
    queryKey: eventTypesAdminKeys.all,
    retry: (count, err) => (isHttp4xx(err) ? false : count < 1),
    queryFn: async () => {
      const res = await adminClient.GET('/admin/event-types');
      if (res.error) throw toHttpError(res.error, res.response);
      return res.data;
    },
  });
}

export function useCreateEventType() {
  const queryClient = useQueryClient();
  return useMutation<EventType, HttpError, EventTypeCreate>({
    retry: (count, err) => (isHttp4xx(err) ? false : count < 1),
    mutationFn: async (body) => {
      const res = await adminClient.POST('/admin/event-types', { body });
      if (res.error) throw toHttpError(res.error, res.response, 'Create failed');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventTypesAdminKeys.all });
    },
  });
}

export function useUpdateEventType() {
  const queryClient = useQueryClient();
  return useMutation<EventType, HttpError, { slug: string; body: EventTypeUpdate }>({
    retry: (count, err) => (isHttp4xx(err) ? false : count < 1),
    mutationFn: async ({ slug, body }) => {
      const res = await adminClient.PATCH('/admin/event-types/{slug}', {
        params: { path: { slug } },
        body,
      });
      if (res.error) throw toHttpError(res.error, res.response, 'Update failed');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventTypesAdminKeys.all });
    },
  });
}

export function useToggleActiveEventType() {
  const queryClient = useQueryClient();
  return useMutation<
    EventType,
    HttpError,
    { slug: string; active: boolean },
    { previous?: EventType[] }
  >({
    retry: false,
    mutationFn: async ({ slug, active }) => {
      const res = await adminClient.PATCH('/admin/event-types/{slug}', {
        params: { path: { slug } },
        body: { active },
      });
      if (res.error) throw toHttpError(res.error, res.response, 'Update failed');
      return res.data;
    },
    onMutate: async ({ slug, active }) => {
      await queryClient.cancelQueries({ queryKey: eventTypesAdminKeys.all });
      const previous = queryClient.getQueryData<EventType[]>(eventTypesAdminKeys.all);
      if (previous) {
        queryClient.setQueryData<EventType[]>(
          eventTypesAdminKeys.all,
          previous.map((e) => (e.slug === slug ? { ...e, active } : e)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(eventTypesAdminKeys.all, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: eventTypesAdminKeys.all });
    },
  });
}
