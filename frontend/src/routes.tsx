import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { Layout } from './components/Layout';
import { AdminGate } from './components/AdminGate';
import { AdminLayout } from './components/AdminLayout';
import { RouteErrorElement } from './components/RouteErrorElement';
import { CatalogPage } from './features/catalog/CatalogPage';
import { SlotPickerPage } from './features/slot-picker/SlotPickerPage';
import { ConfirmPage } from './features/booking/ConfirmPage';
import { SuccessPage } from './features/booking/SuccessPage';
import { SettingsPage } from './features/admin/SettingsPage';
import { EventTypesPage } from './features/admin/EventTypesPage';
import { BookingsPage } from './features/admin/BookingsPage';
import { NotFoundPage } from './features/NotFoundPage';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        // Pass-through route: hosts errorElement so guest Layout chrome survives child render errors.
        element: <Outlet />,
        errorElement: <RouteErrorElement />,
        children: [
          { path: '/', element: <CatalogPage /> },
          { path: '/events/:slug', element: <SlotPickerPage /> },
          { path: '/events/:slug/confirm', element: <ConfirmPage /> },
          { path: '/events/:slug/booked/:id', element: <SuccessPage /> },
        ],
      },
    ],
  },
  {
    path: '/admin',
    element: <AdminGate />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          {
            // Pass-through route: hosts errorElement so admin AdminLayout chrome survives child render errors.
            element: <Outlet />,
            errorElement: <RouteErrorElement />,
            children: [
              { index: true, element: <Navigate to="settings" replace /> },
              { path: 'settings', element: <SettingsPage /> },
              { path: 'event-types', element: <EventTypesPage /> },
              { path: 'bookings', element: <BookingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
