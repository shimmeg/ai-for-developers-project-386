import createClient from 'openapi-fetch';
import type { paths } from './types';
import { env } from '../lib/env';

export const apiClient = createClient<paths>({
  baseUrl: env.apiBaseUrl,
});

export type ApiError = {
  code: string;
  message: string;
};

export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
