import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

if (process.env.VITEST && !process.env.VITE_API_BASE_URL) {
  process.env.VITE_API_BASE_URL = 'http://127.0.0.1:4010';
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
