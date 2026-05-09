import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';
import { getAdminToken, setAdminToken } from '../lib/adminToken';

beforeEach(() => {
  localStorage.clear();
});

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/admin/settings']}>
      <MantineProvider>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="settings" element={<div>settings page</div>} />
          </Route>
          <Route path="/" element={<div>home</div>} />
        </Routes>
      </MantineProvider>
    </MemoryRouter>,
  );
}

describe('AdminLayout', () => {
  it('renders the admin brand and a Settings nav link', () => {
    setAdminToken('tok');
    renderLayout();
    expect(screen.getByText(/calendar \(admin\)/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByText('settings page')).toBeInTheDocument();
  });

  it('signs out and navigates home on click', async () => {
    setAdminToken('tok');
    renderLayout();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(getAdminToken()).toBeNull();
    expect(screen.getByText('home')).toBeInTheDocument();
  });
});
