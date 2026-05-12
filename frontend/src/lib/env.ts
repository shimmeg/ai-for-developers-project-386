const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

// Empty string is a valid value: it means "call the API on the same origin"
// (used by the single-image Docker deployment). Only `undefined` — i.e. the
// variable wasn't set at build time at all — is an error.
if (apiBaseUrl === undefined) {
  throw new Error('VITE_API_BASE_URL is not set. Copy .env.example to .env and configure it.');
}

export const env = {
  apiBaseUrl: apiBaseUrl as string,
};
