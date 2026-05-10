let cached: string[] | null = null;

function loadList(): string[] {
  // Intl.supportedValuesOf is supported in all browsers we target.
  // Throws TypeError on older runtimes; let it bubble.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (Intl as any).supportedValuesOf?.('timeZone');
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
