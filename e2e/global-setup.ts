import { request } from '@playwright/test';
import { ADMIN_TOKEN, BACKEND_URL } from './playwright.config';

export const SEED_SLUG = 'intro-call';
export const SEED_NAME = 'Intro call';
export const SEED_DURATION = 30;
const SEED_DESCRIPTION = 'A 30-minute introductory conversation.';

export default async function globalSetup(): Promise<void> {
  const api = await request.newContext({
    baseURL: BACKEND_URL,
    extraHTTPHeaders: { 'X-Admin-Token': ADMIN_TOKEN },
  });

  try {
    // 1) Фиксируем working hours явно — defaults бэкенда уже Mon-Fri 09-18
    //    (см. backend/internal/domain/settings.go), но не хочется ловить
    //    падения от смены дефолтов в будущем.
    const settingsRes = await api.put('/admin/settings', {
      data: {
        timezone: 'Europe/Moscow',
        workingHours: {
          monday: { status: 'open', start: '09:00', end: '18:00' },
          tuesday: { status: 'open', start: '09:00', end: '18:00' },
          wednesday: { status: 'open', start: '09:00', end: '18:00' },
          thursday: { status: 'open', start: '09:00', end: '18:00' },
          friday: { status: 'open', start: '09:00', end: '18:00' },
          saturday: { status: 'closed' },
          sunday: { status: 'closed' },
        },
      },
    });
    if (!settingsRes.ok()) {
      throw new Error(`seed settings failed: ${settingsRes.status()} ${await settingsRes.text()}`);
    }

    // 2) Создаём event type.
    const etRes = await api.post('/admin/event-types', {
      data: {
        slug: SEED_SLUG,
        name: SEED_NAME,
        description: SEED_DESCRIPTION,
        durationMinutes: SEED_DURATION,
      },
    });
    // 201 на первой попытке, 409 — если backend переиспользуется локально
    // (reuseExistingServer:true) и event type уже создан. И то и другое ок.
    if (!etRes.ok() && etRes.status() !== 409) {
      throw new Error(`seed event-type failed: ${etRes.status()} ${await etRes.text()}`);
    }
  } finally {
    await api.dispose();
  }
}
