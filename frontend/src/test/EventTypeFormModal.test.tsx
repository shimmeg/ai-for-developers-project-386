import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventTypeFormModal } from '../features/admin/EventTypeFormModal';
import type { EventType } from '../api/queries/eventTypesAdmin';

const postMock = vi.fn();
const patchMock = vi.fn();

vi.mock('../api/adminClient', () => ({
  adminClient: {
    GET: vi.fn(),
    POST: (...args: unknown[]) => postMock(...args),
    PATCH: (...args: unknown[]) => patchMock(...args),
  },
}));

const ev: EventType = {
  slug: 'intro-call',
  name: 'Intro call',
  description: 'A 30-minute chat.',
  durationMinutes: 30,
  active: true,
};

beforeEach(() => {
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
const conflict = (message: string) =>
  Promise.resolve({
    data: undefined,
    error: { code: 'duplicate', message },
    response: new Response('{}', { status: 409 }),
  });

function renderCreate(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    onClose,
    ...render(
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <EventTypeFormModal mode="create" opened onClose={onClose} />
        </MantineProvider>
      </QueryClientProvider>,
    ),
  };
}

function renderEdit(eventType: EventType, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    onClose,
    ...render(
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <EventTypeFormModal mode="edit" eventType={eventType} opened onClose={onClose} />
        </MantineProvider>
      </QueryClientProvider>,
    ),
  };
}

describe('EventTypeFormModal — create', () => {
  it('submits the form and closes on 201', async () => {
    postMock.mockReturnValue(ok(ev));
    const { onClose } = renderCreate();

    await userEvent.type(screen.getByLabelText(/^slug/i), 'intro-call');
    await userEvent.type(screen.getByLabelText(/^name/i), 'Intro call');
    await userEvent.type(screen.getByLabelText(/^description/i), 'A 30-minute chat.');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [, options] = postMock.mock.calls[0];
    expect((options as { body: unknown }).body).toEqual({
      slug: 'intro-call',
      name: 'Intro call',
      description: 'A 30-minute chat.',
      durationMinutes: 30,
    });
  });

  it('shows an inline slug error on 409', async () => {
    postMock.mockReturnValue(conflict('duplicate slug'));
    renderCreate();
    await userEvent.type(screen.getByLabelText(/^slug/i), 'intro-call');
    await userEvent.type(screen.getByLabelText(/^name/i), 'X');
    await userEvent.type(screen.getByLabelText(/^description/i), 'Some description');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/already in use/i)).toBeInTheDocument();
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('blocks an invalid slug client-side (Zod)', async () => {
    renderCreate();
    await userEvent.type(screen.getByLabelText(/^slug/i), 'Bad Slug!');
    await userEvent.type(screen.getByLabelText(/^name/i), 'X');
    await userEvent.type(screen.getByLabelText(/^description/i), 'Some description');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(screen.getByText(/lowercase letters, digits, and hyphens only/i)).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });
});

describe('EventTypeFormModal — edit', () => {
  it('submits only the changed fields', async () => {
    patchMock.mockReturnValue(ok({ ...ev, name: 'Renamed' }));
    const { onClose } = renderEdit(ev);
    const nameInput = screen.getByLabelText(/^name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [, options] = patchMock.mock.calls[0];
    expect((options as { body: unknown }).body).toEqual({ name: 'Renamed' });
  });

  it('shows the slug-rename collision inline on 409', async () => {
    patchMock.mockReturnValue(conflict('slug taken'));
    renderEdit(ev);
    const slug = screen.getByLabelText(/^slug/i);
    await userEvent.clear(slug);
    await userEvent.type(slug, 'deep-dive');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/already in use/i)).toBeInTheDocument();
  });
});
