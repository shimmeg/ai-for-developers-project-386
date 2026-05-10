import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import type { components } from '../types';
import { HttpError, toHttpError } from '../../lib/httpError';

export type CatalogResponse = components['schemas']['CatalogResponse'];
export type PublicEventType = components['schemas']['PublicEventType'];

export const eventTypesKeys = {
  all: ['event-types'] as const,
  catalog: () => [...eventTypesKeys.all, 'catalog'] as const,
  detail: (slug: string) => [...eventTypesKeys.all, 'detail', slug] as const,
};

export function useCatalog() {
  return useQuery<CatalogResponse, HttpError>({
    queryKey: eventTypesKeys.catalog(),
    queryFn: async () => {
      const res = await apiClient.GET('/event-types');
      // The catalog endpoint declares only a 200 in the contract, so `res.error`
      // is typed as `undefined`. Detect runtime failures via missing data.
      if (!res.data) throw toHttpError(undefined, res.response, 'Failed to load catalog');
      return res.data;
    },
  });
}

export function useEventType(slug: string) {
  return useQuery<PublicEventType, HttpError>({
    queryKey: eventTypesKeys.detail(slug),
    queryFn: async () => {
      const res = await apiClient.GET('/event-types/{slug}', {
        params: { path: { slug } },
      });
      if (res.error) throw toHttpError(res.error, res.response, 'Failed to load event type');
      if (!res.data) throw new HttpError(0, 'empty_response', 'Empty event type response');
      return res.data;
    },
  });
}
