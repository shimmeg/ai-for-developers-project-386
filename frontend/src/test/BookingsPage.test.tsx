import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { BookingsPage } from '../features/admin/BookingsPage';
import type { Booking } from '../api/queries/bookingsAdmin';
import type { OwnerSettings } from '../api/queries/settings';

const getMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('../api/adminClient', () => ({
  adminClient: {
    GET: (...args: unknown[]) => getMock(...args),
    DELETE: (...args: unknown[]) => deleteMock(...args),
  },
}));

const settings: OwnerSettings = {
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

const intro: Booking = {
  id: 'a-1',
  eventTypeSlug: 'intro-call',
  eventTypeName: 'Intro call',
  startTime: '2026-05-12T10:00:00+03:00',
  durationMinutesSnapshot: 30,
  guestName: 'Jane Doe',
  guestEmail: 'jane@example.com',
  guestNotes: 'Looking forward to chatting about the project.',
  createdAt: '2026-05-09T14:23:11+03:00',
};
const deep: Booking = {
  id: 'b-2',
  eventTypeSlug: 'deep-dive',
  eventTypeName: 'Deep dive',
  startTime: '2026-05-12T14:00:00+03:00',
  durationMinutesSnapshot: 60,
  guestName: 'Sam Patel',
  guestEmail: 'sam@example.com',
  createdAt: '2026-05-10T09:14:02+03:00',
};
const office: Booking = {
  id: 'c-3',
  eventTypeSlug: 'office-hours',
  eventTypeName: 'Office hours',
  startTime: '2026-05-13T09:30:00+03:00',
  durationMinutesSnapshot: 15,
  guestName: 'Mei Chen',
  guestEmail: 'mei@example.com',
  guestNotes: 'Quick question about timezones.',
  createdAt: '2026-05-10T11:02:55+03:00',
};
const bookings: Booking[] = [intro, deep, office];

beforeEach(() => {
  getMock.mockReset();
  deleteMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

const ok = <T,>(data: T) =>
  Promise.resolve({
    data,
    error: undefined,
    response: new Response(JSON.stringify(data), { status: 200 }),
  });
const noContent = () =>
  Promise.resolve({
    data: undefined,
    error: undefined,
    response: new Response(null, { status: 204 }),
  });
const fail = (status: number, code: string, message: string) =>
  Promise.resolve({
    data: undefined,
    error: { code, message },
    response: new Response('{}', { status }),
  });

function mockGetByPath(map: Record<string, ReturnType<typeof ok | typeof fail>>) {
  getMock.mockImplementation((path: string) => {
    if (path in map) return map[path];
    throw new Error(`unmocked GET ${path}`);
  });
}

function renderPage() {
  const qc = new QueryClient({
    // The hooks set their own retry policy; retryDelay: 0 keeps the retry-on-5xx
    // path observable in tests without the default 1 s exponential delay.
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <BookingsPage />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('BookingsPage', () => {
  it('renders rows in the order returned by the server, in the owner timezone', async () => {
    mockGetByPath({
      '/admin/settings': ok(settings),
      '/admin/bookings': ok(bookings),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.getByText('Sam Patel')).toBeInTheDocument();
    expect(screen.getByText('Mei Chen')).toBeInTheDocument();
    expect(screen.getByText(/All times shown in Europe\/Moscow/i)).toBeInTheDocument();
    expect(screen.getByText(/Tuesday, 12 May 2026 at 10:00/i)).toBeInTheDocument();
  });

  it('shows the bookings ErrorState with Retry on a 500', async () => {
    mockGetByPath({
      '/admin/settings': ok(settings),
      '/admin/bookings': fail(500, 'boom', 'server boom'),
    });
    renderPage();
    expect(await screen.findByText(/couldn't load bookings/i)).toBeInTheDocument();
    expect(screen.getByText(/server boom/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows the settings ErrorState when settings fails', async () => {
    mockGetByPath({
      '/admin/settings': fail(500, 'boom', 'settings boom'),
      '/admin/bookings': ok(bookings),
    });
    renderPage();
    expect(await screen.findByText(/couldn't load settings/i)).toBeInTheDocument();
  });

  it('renders the empty state with a CTA to event types', async () => {
    mockGetByPath({
      '/admin/settings': ok(settings),
      '/admin/bookings': ok([]),
    });
    renderPage();
    expect(await screen.findByText(/no upcoming bookings/i)).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /event types/i });
    expect(cta).toHaveAttribute('href', '/admin/event-types');
  });

  it('cancels a booking optimistically and shows a success toast', async () => {
    mockGetByPath({
      '/admin/settings': ok(settings),
      '/admin/bookings': ok(bookings),
    });
    let resolve!: () => void;
    deleteMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = () =>
          r({
            data: undefined,
            error: undefined,
            response: new Response(null, { status: 204 }),
          });
      }),
    );
    renderPage();
    const janeRow = (await screen.findByText('Jane Doe')).closest('tr')!;
    await userEvent.click(within(janeRow).getByRole('button', { name: /cancel/i }));
    // Modal opens
    const modal = await screen.findByRole('dialog', { name: /cancel booking/i });
    await userEvent.click(within(modal).getByRole('button', { name: /^cancel booking$/i }));
    // Optimistic remove: row gone immediately, before DELETE resolves
    await waitFor(() => expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument());
    expect(deleteMock).toHaveBeenCalledTimes(1);
    const [path, options] = deleteMock.mock.calls[0];
    expect(path).toBe('/admin/bookings/{id}');
    expect((options as { params: { path: { id: string } } }).params.path.id).toBe('a-1');
    resolve();
    // Success toast surfaces
    expect(await screen.findByText(/booking cancelled/i)).toBeInTheDocument();
  });

  it('rolls the row back when the DELETE returns 500', async () => {
    mockGetByPath({
      '/admin/settings': ok(settings),
      '/admin/bookings': ok(bookings),
    });
    let resolve!: () => void;
    deleteMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = () =>
          r({
            data: undefined,
            error: { code: 'boom', message: 'server boom' },
            response: new Response('{}', { status: 500 }),
          });
      }),
    );
    renderPage();
    const janeRow = (await screen.findByText('Jane Doe')).closest('tr')!;
    await userEvent.click(within(janeRow).getByRole('button', { name: /cancel/i }));
    const modal = await screen.findByRole('dialog', { name: /cancel booking/i });
    await userEvent.click(within(modal).getByRole('button', { name: /^cancel booking$/i }));
    await waitFor(() => expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument());
    resolve();
    // Row reappears after the rollback
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    // Error toast surfaces
    expect(await screen.findByText(/server boom/i)).toBeInTheDocument();
  });

  it('rolls the row back on a 404 stale id', async () => {
    mockGetByPath({
      '/admin/settings': ok(settings),
      '/admin/bookings': ok(bookings),
    });
    let resolve!: () => void;
    deleteMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = () =>
          r({
            data: undefined,
            error: { code: 'not_found', message: 'gone' },
            response: new Response('{}', { status: 404 }),
          });
      }),
    );
    renderPage();
    const janeRow = (await screen.findByText('Jane Doe')).closest('tr')!;
    await userEvent.click(within(janeRow).getByRole('button', { name: /cancel/i }));
    const modal = await screen.findByRole('dialog', { name: /cancel booking/i });
    await userEvent.click(within(modal).getByRole('button', { name: /^cancel booking$/i }));
    await waitFor(() => expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument());
    resolve();
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(await screen.findByText(/gone/i)).toBeInTheDocument();
  });

  it('renders an em-dash for bookings without notes', async () => {
    mockGetByPath({
      '/admin/settings': ok(settings),
      '/admin/bookings': ok(bookings),
    });
    renderPage();
    const samRow = (await screen.findByText('Sam Patel')).closest('tr')!;
    // Sam has no guestNotes, so the cell shows the em-dash
    expect(within(samRow).getByText('—')).toBeInTheDocument();
  });
});
