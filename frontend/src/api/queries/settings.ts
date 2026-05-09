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
      const { data, error, response } = await adminClient.GET('/admin/settings');
      if (error) {
        throw new HttpError(
          response.status,
          error.code ?? 'http_error',
          error.message ?? 'Request failed',
        );
      }
      if (!data) throw new HttpError(response.status, 'empty', 'Empty settings response');
      return data;
    },
  });
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();
  return useMutation<OwnerSettings, HttpError, OwnerSettings>({
    mutationFn: async (body) => {
      const { data, error, response } = await adminClient.PUT('/admin/settings', { body });
      if (error) {
        throw new HttpError(
          response.status,
          error.code ?? 'http_error',
          error.message ?? 'Update failed',
        );
      }
      if (!data) throw new HttpError(response.status, 'empty', 'Empty settings response');
      return data;
    },
    retry: (count, err) => (isHttp4xx(err) ? false : count < 1),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.all, data);
    },
  });
}
