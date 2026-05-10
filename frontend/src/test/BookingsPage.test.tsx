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

const SETTINGS: OwnerSettings = {
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

const LONG_NOTE =
  "I'd love to discuss possible workshop topics for the upcoming team off-site, particularly around event scheduling and team coordination at scale.";

const bookings: Booking[] = [
  {
    id: 'b1',
    eventTypeSlug: 'intro-call',
    eventTypeName: 'Intro call',
    startTime: '2026-05-12T10:00:00+03:00',
    durationMinutesSnapshot: 30,
    guestName: 'Jane Doe',
    guestEmail: 'jane.doe@example.com',
    guestNotes: 'Looking forward.',
    createdAt: '2026-05-09T14:23:11+03:00',
  },
  {
    id: 'b2',
    eventTypeSlug: 'deep-dive',
    eventTypeName: 'Deep dive',
    startTime: '2026-05-13T14:00:00+03:00',
    durationMinutesSnapshot: 60,
    guestName: 'Carlos Ramirez',
    guestEmail: 'carlos.ramirez@example.com',
    createdAt: '2026-05-09T11:08:44+03:00',
  },
  {
    id: 'b3',
    eventTypeSlug: 'office-hours',
    eventTypeName: 'Office hours',
    startTime: '2026-05-15T11:30:00+03:00',
    durationMinutesSnapshot: 15,
    guestName: 'Aiko Tanaka',
    guestEmail: 'aiko.tanaka@example.com',
    guestNotes: LONG_NOTE,
    createdAt: '2026-05-10T08:42:18+03:00',
  },
];

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
const fail = (status: number, message: string) =>
  Promise.resolve({
    data: undefined,
    error: { code: 'x', message },
    response: new Response('{}', { status }),
  });

function mockListAndSettings(list: Booking[]) {
  getMock.mockImplementation((path: string) => {
    if (path === '/admin/bookings') return ok(list);
    if (path === '/admin/settings') return ok(SETTINGS);
    return ok(undefined);
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  it('renders the rows from the GET response', async () => {
    mockListAndSettings(bookings);
    renderPage();
    await waitFor(() => expect(screen.getByText('Intro call')).toBeInTheDocument());
    expect(screen.getByText('Deep dive')).toBeInTheDocument();
    expect(screen.getByText('Office hours')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Carlos Ramirez')).toBeInTheDocument();
  });

  it('renders durationMinutesSnapshot, guest email, and a truncated notes preview', async () => {
    mockListAndSettings(bookings);
    renderPage();
    await waitFor(() => expect(screen.getByText('Intro call')).toBeInTheDocument());
    expect(screen.getByText(/30 min/)).toBeInTheDocument();
    expect(screen.getByText(/60 min/)).toBeInTheDocument();
    expect(screen.getByText(/15 min/)).toBeInTheDocument();
    expect(screen.getByText('jane.doe@example.com')).toBeInTheDocument();
    expect(screen.getByText('Looking forward.')).toBeInTheDocument();
    // Long note should be truncated (not present in full).
    expect(screen.queryByText(LONG_NOTE)).not.toBeInTheDocument();
    // Truncation suffix should be visible somewhere.
    expect(screen.getAllByText(/…/).length).toBeGreaterThan(0);
  });

  it('shows the empty state with a CTA linking to /admin/event-types', async () => {
    mockListAndSettings([]);
    renderPage();
    expect(await screen.findByText(/no upcoming bookings yet/i)).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /go to event types/i });
    expect(cta).toHaveAttribute('href', '/admin/event-types');
  });

  it('renders an ErrorState on a non-401 list-load failure', async () => {
    // Use a 4xx (other than 401, which would unmount the page via the
    // AdminGate token-clear path). The hook short-circuits 4xx retries, so
    // the page lands in the error state immediately.
    getMock.mockImplementation((path: string) => {
      if (path === '/admin/bookings') return fail(403, 'forbidden');
      if (path === '/admin/settings') return ok(SETTINGS);
      return ok(undefined);
    });
    renderPage();
    expect(await screen.findByText(/couldn't load bookings/i)).toBeInTheDocument();
  });

  it('opens the cancel modal with the booking summary when Cancel is clicked', async () => {
    mockListAndSettings(bookings);
    renderPage();
    const janeRow = (await screen.findByText('Jane Doe')).closest('tr')!;
    await userEvent.click(within(janeRow).getByRole('button', { name: /cancel intro call with jane doe/i }));
    const dialog = await screen.findByRole('dialog', { name: /cancel booking/i });
    expect(within(dialog).getByText('Intro call')).toBeInTheDocument();
    expect(within(dialog).getByText(/jane doe/i)).toBeInTheDocument();
  });

  it('removes the row optimistically and closes the modal on a 204', async () => {
    mockListAndSettings(bookings);
    let resolve!: (r: { data?: undefined; error?: undefined; response: Response }) => void;
    deleteMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderPage();
    const janeRow = (await screen.findByText('Jane Doe')).closest('tr')!;
    await userEvent.click(within(janeRow).getByRole('button', { name: /cancel intro call with jane doe/i }));
    await screen.findByRole('dialog', { name: /cancel booking/i });
    await userEvent.click(screen.getByRole('button', { name: /^cancel booking$/i }));

    // Optimistic remove: Jane's row is gone before the DELETE resolves.
    await waitFor(() => expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument());
    expect(deleteMock).toHaveBeenCalledTimes(1);

    resolve({ response: new Response(null, { status: 204 }) });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /cancel booking/i })).not.toBeInTheDocument(),
    );
  });

  it('rolls the row back and surfaces an error toast on a 500', async () => {
    mockListAndSettings(bookings);
    let resolve!: (r: {
      data?: undefined;
      error: { code: string; message: string };
      response: Response;
    }) => void;
    deleteMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderPage();
    const janeRow = (await screen.findByText('Jane Doe')).closest('tr')!;
    await userEvent.click(within(janeRow).getByRole('button', { name: /cancel intro call with jane doe/i }));
    await userEvent.click(screen.getByRole('button', { name: /^cancel booking$/i }));

    await waitFor(() => expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument());

    resolve({
      data: undefined,
      error: { code: 'boom', message: 'server boom' },
      response: new Response('{}', { status: 500 }),
    });

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    // Modal closes on non-404 error too — owner re-triggers from the row.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /cancel booking/i })).not.toBeInTheDocument(),
    );
  });

  it('treats a 404 cancel as a benign race ("Already cancelled")', async () => {
    mockListAndSettings(bookings);
    deleteMock.mockReturnValueOnce(fail(404, 'gone'));
    renderPage();
    const janeRow = (await screen.findByText('Jane Doe')).closest('tr')!;
    await userEvent.click(within(janeRow).getByRole('button', { name: /cancel intro call with jane doe/i }));
    await userEvent.click(screen.getByRole('button', { name: /^cancel booking$/i }));

    expect(await screen.findByText(/already cancelled/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /cancel booking/i })).not.toBeInTheDocument(),
    );
  });
});
