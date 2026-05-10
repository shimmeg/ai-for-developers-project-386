let cached: string[] | null = null;

function loadList(): string[] {
  const list = Intl.supportedValuesOf?.('timeZone');
  return Array.isArray(list) ? list : [];
}

export function getSupportedTimezones(): string[] {
  if (!cached) cached = loadList();
  return cached;
}

export function withCurrentTimezone(current: string | null | undefined): string[] {
  const list = getSupportedTimezones();
  if (!current) return list;
  return list.includes(current) ? list : [current, ...list];
}
