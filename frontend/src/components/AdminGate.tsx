import { Outlet } from 'react-router-dom';
import { useAdminToken } from '../lib/useAdminToken';
import { AdminTokenModal } from '../features/admin/AdminTokenModal';

export function AdminGate() {
  const token = useAdminToken();
  if (!token) return <AdminTokenModal />;
  return <Outlet />;
}
