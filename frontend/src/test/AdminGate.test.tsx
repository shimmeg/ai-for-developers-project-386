import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminGate } from '../components/AdminGate';
import { setAdminToken } from '../lib/adminToken';

vi.mock('../features/admin/AdminTokenModal', () => ({
  AdminTokenModal: () => <div data-testid="modal">modal</div>,
}));

beforeEach(() => {
  localStorage.clear();
});

function renderGate(initialPath = '/admin') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Routes>
            <Route element={<AdminGate />}>
              <Route path="/admin" element={<div data-testid="child">child</div>} />
            </Route>
          </Routes>
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AdminGate', () => {
  it('shows the modal when no token is stored', () => {
    renderGate();
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('renders the outlet when a token is stored', () => {
    setAdminToken('tok');
    renderGate();
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('modal')).toBeNull();
  });
});
