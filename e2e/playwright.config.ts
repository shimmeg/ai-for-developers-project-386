import { defineConfig, devices } from '@playwright/test';

const BACKEND_PORT = 3000;
const FRONTEND_PORT = 5173;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

// Backend требует ADMIN_TOKEN длиной >= 16 символов. В CI значение
// прокидывается через env, локально подставляется дефолт.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'e2e-admin-token-please-change-me';

export default defineConfig({
  testDir: './tests',
  // Бэкенд хранит данные в памяти и шарится между тестами одного прогона.
  // Чтобы избежать гонок за уникальный slug event-type, держим один воркер.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['html', { open: 'on-failure' }], ['list']],

  globalSetup: './global-setup.ts',

  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      // Go-бэкенд. Health-check: GET /event-types отдаёт 200 даже при пустом
      // сторе. Не используем make dev — Playwright не дружит с trap 'kill 0'.
      command: 'go run ./cmd/calendar-service',
      cwd: '../backend',
      url: `${BACKEND_URL}/event-types`,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
      env: {
        PORT: String(BACKEND_PORT),
        ADMIN_TOKEN,
        FRONTEND_ORIGIN: FRONTEND_URL,
        DEFAULT_TZ: 'Europe/Moscow',
        LOG_LEVEL: 'warn',
      },
    },
    {
      // Vite dev server, указанный на настоящий Go-бэкенд (а не на Prism mock).
      command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
      cwd: '../frontend',
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
      env: {
        VITE_API_BASE_URL: BACKEND_URL,
      },
    },
  ],
});

export { ADMIN_TOKEN, BACKEND_URL, FRONTEND_URL };
