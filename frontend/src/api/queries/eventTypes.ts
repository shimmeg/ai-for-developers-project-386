import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import type { components } from '../types';

export type CatalogResponse = components['schemas']['CatalogResponse'];
export type PublicEventType = components['schemas']['PublicEventType'];

export const eventTypesKeys = {
  all: ['event-types'] as const,
  catalog: () => [...eventTypesKeys.all, 'catalog'] as const,
  detail: (slug: string) => [...eventTypesKeys.all, 'detail', slug] as const,
};

export function useCatalog() {
  return useQuery({
    queryKey: eventTypesKeys.catalog(),
    queryFn: async (): Promise<CatalogResponse> => {
      const { data, error } = await apiClient.GET('/event-types');
      if (error) throw error;
      if (!data) throw new Error('Empty catalog response');
      return data;
    },
  });
}

export function useEventType(slug: string | undefined) {
  return useQuery({
    queryKey: slug ? eventTypesKeys.detail(slug) : eventTypesKeys.all,
    enabled: Boolean(slug),
    queryFn: async (): Promise<PublicEventType> => {
      if (!slug) throw new Error('Missing event type slug');
      const { data, error } = await apiClient.GET('/event-types/{slug}', {
        params: { path: { slug } },
      });
      if (error) throw error;
      if (!data) throw new Error('Empty event type response');
      return data;
    },
  });
}
