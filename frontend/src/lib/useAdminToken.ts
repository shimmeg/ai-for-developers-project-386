import { useSyncExternalStore } from 'react';
import { getAdminToken, subscribeAdminToken } from './adminToken';

export function useAdminToken(): string | null {
  return useSyncExternalStore(subscribeAdminToken, getAdminToken, () => null);
}
