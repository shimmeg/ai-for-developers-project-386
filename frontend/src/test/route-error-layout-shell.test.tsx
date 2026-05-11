import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { RouteErrorElement } from '../components/RouteErrorElement';

function MockLayout() {
  return (
    <div data-testid="mock-layout-shell">
      <header data-testid="mock-layout-header">chrome stays mounted</header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

function Boom(): never {
  throw new Error('leaf exploded');
}

function renderWithLayout() {
  const router = createMemoryRouter(
    [
      {
        element: <MockLayout />,
        children: [
          {
            element: <Outlet />,
            errorElement: <RouteErrorElement />,
            children: [{ path: '/', element: <Boom /> }],
          },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(
    <MantineProvider>
      <RouterProvider router={router} />
    </MantineProvider>,
  );
}

describe('Route error boundary preserves layout shell', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('keeps the layout chrome mounted when a leaf component throws', () => {
    renderWithLayout();
    expect(screen.getByTestId('mock-layout-shell')).toBeInTheDocument();
    expect(screen.getByTestId('mock-layout-header')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByText('leaf exploded')).toBeInTheDocument();
  });
});
