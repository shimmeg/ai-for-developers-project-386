import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CatalogPage } from './features/catalog/CatalogPage';
import { SlotPickerPage } from './features/slot-picker/SlotPickerPage';
import { ConfirmPage } from './features/booking/ConfirmPage';
import { SuccessPage } from './features/booking/SuccessPage';
import { NotFoundPage } from './features/NotFoundPage';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <CatalogPage /> },
      { path: '/events/:slug', element: <SlotPickerPage /> },
      { path: '/events/:slug/confirm', element: <ConfirmPage /> },
      { path: '/events/:slug/success', element: <SuccessPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
