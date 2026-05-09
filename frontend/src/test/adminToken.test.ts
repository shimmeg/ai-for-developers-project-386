import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAdminToken,
  getAdminToken,
  getRejectedAt,
  setAdminToken,
  subscribeAdminToken,
} from '../lib/adminToken';

beforeEach(() => {
  localStorage.clear();
});

describe('adminToken store', () => {
  it('returns null when nothing is stored', () => {
    expect(getAdminToken()).toBeNull();
    expect(getRejectedAt()).toBeNull();
  });

  it('persists set/clear to localStorage', () => {
    setAdminToken('abc');
    expect(getAdminToken()).toBe('abc');
    expect(localStorage.getItem('calendar.adminToken')).toBe('abc');

    clearAdminToken({ reason: 'signed-out' });
    expect(getAdminToken()).toBeNull();
    expect(localStorage.getItem('calendar.adminToken')).toBeNull();
    expect(getRejectedAt()).toBeNull();
  });

  it('records rejectedAt only when reason is "rejected"', () => {
    setAdminToken('abc');
    clearAdminToken({ reason: 'rejected' });
    const ts = getRejectedAt();
    expect(ts).not.toBeNull();
    expect(ts).toBeGreaterThan(0);
  });

  it('clears rejectedAt on setAdminToken', () => {
    setAdminToken('abc');
    clearAdminToken({ reason: 'rejected' });
    expect(getRejectedAt()).not.toBeNull();
    setAdminToken('def');
    expect(getRejectedAt()).toBeNull();
  });

  it('notifies subscribers on set + clear', () => {
    const cb = vi.fn();
    const unsub = subscribeAdminToken(cb);
    setAdminToken('abc');
    clearAdminToken({ reason: 'rejected' });
    expect(cb).toHaveBeenCalledTimes(2);
    unsub();
    setAdminToken('xyz');
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('reacts to a storage event from another tab', () => {
    const cb = vi.fn();
    subscribeAdminToken(cb);
    localStorage.setItem('calendar.adminToken', 'cross-tab');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'calendar.adminToken',
        newValue: 'cross-tab',
      }),
    );
    expect(cb).toHaveBeenCalled();
    expect(getAdminToken()).toBe('cross-tab');
  });
});
