import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAdminToken } from '../lib/useAdminToken';
import { clearAdminToken, setAdminToken } from '../lib/adminToken';

beforeEach(() => {
  localStorage.clear();
});

describe('useAdminToken', () => {
  it('returns null when no token is stored', () => {
    const { result } = renderHook(() => useAdminToken());
    expect(result.current).toBeNull();
  });

  it('returns the current token after set', () => {
    const { result } = renderHook(() => useAdminToken());
    act(() => setAdminToken('abc'));
    expect(result.current).toBe('abc');
  });

  it('updates after clear', () => {
    setAdminToken('abc');
    const { result } = renderHook(() => useAdminToken());
    expect(result.current).toBe('abc');
    act(() => clearAdminToken({ reason: 'signed-out' }));
    expect(result.current).toBeNull();
  });
});
