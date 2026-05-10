import type { DayStatus } from '../../api/queries/slots';

export { formatHourMinute as formatSlotTime, formatDayHeader } from '../../lib/datetime';

export function statusLabel(status: DayStatus): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'closed':
      return 'Closed';
    case 'no-availability':
      return 'No availability';
  }
}

export function statusColor(status: DayStatus): 'green' | 'gray' | 'orange' {
  switch (status) {
    case 'open':
      return 'green';
    case 'closed':
      return 'gray';
    case 'no-availability':
      return 'orange';
  }
}
