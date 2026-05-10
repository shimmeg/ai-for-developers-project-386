import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from '../features/admin/SettingsPage';
import type { OwnerSettings } from '../api/queries/settings';

const exampleSettings: OwnerSettings = {
  timezone: 'Europe/Moscow',
  workingHours: {
    monday: { status: 'open', start: '09:00', end: '18:00' },
    tuesday: { status: 'open', start: '09:00', end: '18:00' },
    wednesday: { status: 'open', start: '09:00', end: '18:00' },
    thursday: { status: 'open', start: '09:00', end: '18:00' },
    friday: { status: 'open', start: '09:00', end: '17:00' },
    saturday: { status: 'closed' },
    sunday: { status: 'closed' },
  },
};

const legacyTimezoneSettings: OwnerSettings = {
  ...exampleSettings,
  timezone: 'Etc/Calendar_Legacy',
};

const getMock = vi.fn();
const putMock = vi.fn();

vi.mock('../api/adminClient', () => ({
  adminClient: {
    GET: (...args: unknown[]) => getMock(...args),
    PUT: (...args: unknown[]) => putMock(...args),
  },
}));

beforeEach(() => {
  getMock.mockReset();
  putMock.mockReset();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <SettingsPage />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const ok = (data: OwnerSettings) =>
  Promise.resolve({
    data,
    error: undefined,
    response: new Response(JSON.stringify(data), { status: 200 }),
  });

describe('SettingsPage', () => {
  it('renders fetched settings into the form', async () => {
    getMock.mockReturnValue(ok(exampleSettings));
    renderPage();
    await waitFor(() =>
      expect(screen.getByDisplayValue('Europe/Moscow')).toBeInTheDocument(),
    );
    expect(screen.getAllByDisplayValue('09:00').length).toBeGreaterThan(0);
  });

  it('submits the normalized payload on Save', async () => {
    getMock.mockReturnValue(ok(exampleSettings));
    putMock.mockReturnValue(ok(exampleSettings));
    renderPage();
    await screen.findByDisplayValue('Europe/Moscow');

    const satRow = screen.getByText('Saturday').closest('tr')!;
    await userEvent.click(within(satRow).getByRole('switch'));

    const save = screen.getByRole('button', { name: /save changes/i });
    expect(save).toBeEnabled();
    await userEvent.click(save);

    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1));
    const [, options] = putMock.mock.calls[0];
    const body = (options as { body: OwnerSettings }).body;
    expect(body.workingHours.saturday).toMatchObject({ status: 'open' });
    expect(body.workingHours.sunday).toEqual({ status: 'closed' });
  });

  it('allows saving the current server timezone when it is not in Intl.supportedValuesOf', async () => {
    getMock.mockReturnValue(ok(legacyTimezoneSettings));
    putMock.mockReturnValue(ok(legacyTimezoneSettings));
    renderPage();
    await screen.findByDisplayValue('Etc/Calendar_Legacy');

    const satRow = screen.getByText('Saturday').closest('tr')!;
    await userEvent.click(within(satRow).getByRole('switch'));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1));
    const [, options] = putMock.mock.calls[0];
    expect((options as { body: OwnerSettings }).body.timezone).toBe('Etc/Calendar_Legacy');
  });

  it('shows the 400 error message in a top-level alert', async () => {
    getMock.mockReturnValue(ok(exampleSettings));
    putMock.mockReturnValue(
      Promise.resolve({
        data: undefined,
        error: { code: 'invalid', message: 'Working hours overlap.' },
        response: new Response('{}', { status: 400 }),
      }),
    );
    renderPage();
    await screen.findByDisplayValue('Europe/Moscow');

    const sunRow = screen.getByText('Sunday').closest('tr')!;
    await userEvent.click(within(sunRow).getByRole('switch'));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/working hours overlap/i)).toBeInTheDocument();
  });
});
