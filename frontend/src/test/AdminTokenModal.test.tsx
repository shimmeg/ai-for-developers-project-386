import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { AdminTokenModal } from '../features/admin/AdminTokenModal';
import { clearAdminToken, getAdminToken, setAdminToken } from '../lib/adminToken';

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <AdminTokenModal />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AdminTokenModal', () => {
  it('stores the token on a 200 response', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ timezone: 'UTC', workingHours: {} }), { status: 200 }),
    );
    renderModal();
    await userEvent.type(screen.getByLabelText(/admin token/i), 'good-token');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(getAdminToken()).toBe('good-token'));
  });

  it('shows the rejection alert on 401 and does not store', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'unauthorized', message: 'bad' }), { status: 401 }),
    );
    renderModal();
    await userEvent.type(screen.getByLabelText(/admin token/i), 'bad-token');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/that token was rejected/i)).toBeInTheDocument();
    expect(getAdminToken()).toBeNull();
  });

  it('shows the rejection alert on mount when rejectedAt is present', () => {
    setAdminToken('x');
    clearAdminToken({ reason: 'rejected' });
    renderModal();
    expect(screen.getByText(/that token was rejected/i)).toBeInTheDocument();
  });

  it('locks the submit button while a request is in flight', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    renderModal();
    await userEvent.type(screen.getByLabelText(/admin token/i), 'tok');
    const btn = screen.getByRole('button', { name: /sign in/i });
    await userEvent.click(btn);
    expect(btn).toBeDisabled();
    resolve(new Response(JSON.stringify({}), { status: 200 }));
    await waitFor(() => expect(getAdminToken()).toBe('tok'));
  });
});
