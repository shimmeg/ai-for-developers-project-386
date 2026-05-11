import { type ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RouteErrorElement } from '../components/RouteErrorElement';

function Boom(): never {
  throw new Error('boom');
}

function ThrowString(): never {
  throw 'oops' as unknown as Error;
}

function renderRoute(element: ReactNode) {
  const router = createMemoryRouter(
    [{ path: '/', element, errorElement: <RouteErrorElement /> }],
    { initialEntries: ['/'] },
  );
  return render(
    <MantineProvider>
      <RouterProvider router={router} />
    </MantineProvider>,
  );
}

describe('RouteErrorElement', () => {
  beforeEach(() => {
    // The test deliberately renders throwing components; suppress React's
    // noisy console.error output so the test log stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders the ErrorState title, error message, and a Retry button when an Error is thrown', () => {
    renderRoute(<Boom />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('falls back to "Unexpected error" when a non-Error value is thrown', () => {
    renderRoute(<ThrowString />);
    expect(screen.getByText('Unexpected error')).toBeInTheDocument();
  });
});
