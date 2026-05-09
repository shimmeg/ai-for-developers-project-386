import dayjs from 'dayjs';
import type { DayStatus } from '../../api/queries/slots';

export function formatSlotTime(iso: string): string {
  return dayjs(iso).format('HH:mm');
}

export function formatDayHeader(isoDate: string): { weekday: string; date: string } {
  const d = dayjs(isoDate);
  return {
    weekday: d.format('ddd'),
    date: d.format('MMM D'),
  };
}

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
