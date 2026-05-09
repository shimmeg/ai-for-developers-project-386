import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom in vitest 4 ships without a working localStorage when the URL is
// `about:blank`. Provide a minimal in-memory implementation so tests using
// localStorage work regardless of the underlying jsdom URL.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

if (typeof window !== 'undefined' && !('localStorage' in window && window.localStorage)) {
  Object.defineProperty(window, 'localStorage', {
    value: new MemoryStorage(),
    writable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: window.localStorage,
    writable: true,
  });
}
if (typeof window !== 'undefined' && !('sessionStorage' in window && window.sessionStorage)) {
  Object.defineProperty(window, 'sessionStorage', {
    value: new MemoryStorage(),
    writable: true,
  });
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = window.ResizeObserver ?? (ResizeObserverMock as typeof ResizeObserver);
