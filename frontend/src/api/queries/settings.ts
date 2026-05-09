import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminClient } from '../adminClient';
import type { components } from '../types';
import { HttpError } from '../../lib/httpError';

export type OwnerSettings = components['schemas']['OwnerSettings'];

export const settingsKeys = {
  all: ['admin', 'settings'] as const,
};

function isHttp4xx(err: unknown): boolean {
  return err instanceof HttpError && err.status >= 400 && err.status < 500;
}

export function useAdminSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    retry: (count, err) => (isHttp4xx(err) ? false : count < 1),
    queryFn: async (): Promise<OwnerSettings> => {
      const res = await adminClient.GET('/admin/settings');
      if (res.error) {
        throw new HttpError(
          res.response.status,
          res.error.code ?? 'http_error',
          res.error.message ?? 'Request failed',
        );
      }
      return res.data;
    },
  });
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();
  return useMutation<OwnerSettings, HttpError, OwnerSettings>({
    mutationFn: async (body) => {
      const res = await adminClient.PUT('/admin/settings', { body });
      if (res.error) {
        throw new HttpError(
          res.response.status,
          res.error.code ?? 'http_error',
          res.error.message ?? 'Update failed',
        );
      }
      return res.data;
    },
    retry: (count, err) => (isHttp4xx(err) ? false : count < 1),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.all, data);
    },
  });
}
