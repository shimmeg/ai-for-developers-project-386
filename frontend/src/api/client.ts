import createClient from 'openapi-fetch';
import type { paths } from './types';
import { env } from '../lib/env';
import { HttpError } from '../lib/httpError';

export const apiClient = createClient<paths>({
  baseUrl: env.apiBaseUrl,
});

export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error) return error.message || fallback;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const msg = (error as { message: string }).message;
    if (msg.length > 0) return msg;
  }
  return fallback;
}
