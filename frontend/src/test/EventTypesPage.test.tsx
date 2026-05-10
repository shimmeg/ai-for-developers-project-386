import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EventTypesPage } from '../features/admin/EventTypesPage';
import type { EventType } from '../api/queries/eventTypesAdmin';

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();

vi.mock('../api/adminClient', () => ({
  adminClient: {
    GET: (...args: unknown[]) => getMock(...args),
    POST: (...args: unknown[]) => postMock(...args),
    PATCH: (...args: unknown[]) => patchMock(...args),
  },
}));

const list: EventType[] = [
  { slug: 'intro', name: 'Intro', description: 'd', durationMinutes: 30, active: true },
  { slug: 'deep', name: 'Deep dive', description: 'd', durationMinutes: 60, active: true },
  { slug: 'wrk', name: 'Workshop', description: 'd', durationMinutes: 90, active: false },
];

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  patchMock.mockReset();
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <EventTypesPage />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('EventTypesPage', () => {
  it('renders the rows from the GET response', async () => {
    getMock.mockReturnValue(ok(list));
    renderPage();
    await waitFor(() => expect(screen.getByText('Intro')).toBeInTheDocument());
    expect(screen.getByText('Deep dive')).toBeInTheDocument();
    expect(screen.getByText('Workshop')).toBeInTheDocument();
  });

  it('shows the empty state with a CTA', async () => {
    getMock.mockReturnValue(ok([]));
    renderPage();
    expect(await screen.findByText(/no event types yet/i)).toBeInTheDocument();
  });

  it('toggles active optimistically and dispatches a PATCH', async () => {
    getMock.mockReturnValue(ok(list));
    // Defer the PATCH so the optimistic flip is observable before the
    // post-success refetch can reset the row from the (still active=true)
    // mocked GET response.
    let resolve!: (r: { data: EventType; error?: never; response: Response }) => void;
    patchMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderPage();
    const introRow = (await screen.findByText('Intro')).closest('tr')!;
    const toggle = within(introRow).getByRole('switch');
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(patchMock).toHaveBeenCalledTimes(1);
    const [, options] = patchMock.mock.calls[0];
    expect((options as { body: { active: boolean } }).body).toEqual({ active: false });
    resolve({
      data: { ...list[0], active: false },
      response: new Response(JSON.stringify({ ...list[0], active: false }), { status: 200 }),
    });
  });

  it('rolls back the toggle when the PATCH fails', async () => {
    getMock.mockReturnValue(ok(list));
    // Defer the PATCH so we can observe the optimistic flip before the error
    // arrives and the rollback runs.
    let resolve!: (r: { data?: unknown; error: { code: string; message: string }; response: Response }) => void;
    patchMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderPage();
    const introRow = (await screen.findByText('Intro')).closest('tr')!;
    const toggle = within(introRow).getByRole('switch');
    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    resolve({
      data: undefined,
      error: { code: 'boom', message: 'server boom' },
      response: new Response('{}', { status: 500 }),
    });
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('opens the create modal from the header button', async () => {
    getMock.mockReturnValue(ok(list));
    renderPage();
    await screen.findByText('Intro');
    const headerButton = screen.getAllByRole('button', { name: /new event type/i })[0];
    await userEvent.click(headerButton);
    expect(await screen.findByRole('dialog', { name: /new event type/i })).toBeInTheDocument();
  });

  it('opens the edit modal from a row Edit button', async () => {
    getMock.mockReturnValue(ok(list));
    renderPage();
    const introRow = (await screen.findByText('Intro')).closest('tr')!;
    await userEvent.click(within(introRow).getByRole('button', { name: /edit/i }));
    expect(await screen.findByRole('dialog', { name: /edit intro/i })).toBeInTheDocument();
  });
});
