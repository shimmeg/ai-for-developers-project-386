const TOKEN_KEY = 'calendar.adminToken';
const REJECTED_AT_KEY = 'calendar.adminTokenRejectedAt';

const subscribers = new Set<() => void>();

function notify(): void {
  for (const cb of subscribers) cb();
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getRejectedAt(): number | null {
  try {
    const raw = localStorage.getItem(REJECTED_AT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(REJECTED_AT_KEY);
  } catch {
    /* swallow — storage unavailable */
  }
  notify();
}

export function clearAdminToken(opts?: { reason?: 'rejected' | 'signed-out' }): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    if (opts?.reason === 'rejected') {
      localStorage.setItem(REJECTED_AT_KEY, String(Date.now()));
    } else {
      localStorage.removeItem(REJECTED_AT_KEY);
    }
  } catch {
    /* swallow */
  }
  notify();
}

export function subscribeAdminToken(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === TOKEN_KEY || e.key === REJECTED_AT_KEY || e.key === null) {
      notify();
    }
  });
}
