import { test, expect } from '@playwright/test';
import { SEED_SLUG, SEED_NAME, SEED_DURATION } from '../global-setup';

test.describe('Guest booking happy path', () => {
  test('books the first available slot end to end', async ({ page }) => {
    // --- Catalog --------------------------------------------------------
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Book a meeting' })).toBeVisible();

    const catalogCard = page.getByRole('link', {
      name: `View available slots for ${SEED_NAME}`,
    });
    await expect(catalogCard).toBeVisible();
    await catalogCard.click();

    // --- Slot picker ----------------------------------------------------
    await expect(page).toHaveURL(new RegExp(`/events/${SEED_SLUG}$`));
    await expect(page.getByRole('heading', { name: SEED_NAME })).toBeVisible();

    const continueBtn = page.getByRole('button', { name: 'Continue' });
    await expect(continueBtn).toBeDisabled();

    // Выбираем ПЕРВЫЙ доступный слот динамически — даты/часы плавают, а
    // aria-pressed="false" есть у каждой кнопки слота до клика. Намеренно
    // не хардкодим время вроде "09:00" — это бы сделало тест flaky после
    // любого изменения working hours.
    const firstSlot = page.locator('button[aria-pressed="false"]').first();
    await expect(firstSlot).toBeVisible({ timeout: 10_000 });
    await firstSlot.click();

    await expect(firstSlot).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/\?slot=/);
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // --- Confirm --------------------------------------------------------
    await expect(page).toHaveURL(new RegExp(`/events/${SEED_SLUG}/confirm\\?slot=`));
    await expect(page.getByRole('heading', { name: 'Confirm your booking' })).toBeVisible();
    await expect(page.getByText(`${SEED_DURATION} min`).first()).toBeVisible();

    const guestName = 'Jane Doe';
    const guestEmail = 'jane@example.com';
    const guestNotes = 'Looking forward to it.';

    await page.getByLabel('Your name').fill(guestName);
    await page.getByLabel('Email').fill(guestEmail);
    await page.getByLabel('Notes').fill(guestNotes);

    await page.getByRole('button', { name: 'Confirm booking' }).click();

    // --- Success --------------------------------------------------------
    await expect(page).toHaveURL(
      new RegExp(`/events/${SEED_SLUG}/booked/[0-9a-f-]{36}$`),
    );
    await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();

    // Имя event type рендерится как <Title order={3}> — это <h3>.
    await expect(page.getByRole('heading', { name: SEED_NAME, level: 3 })).toBeVisible();
    await expect(page.getByText(guestName)).toBeVisible();
    await expect(page.getByText(guestEmail)).toBeVisible();
    await expect(page.getByText(guestNotes)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Book another' })).toBeVisible();
  });
});
