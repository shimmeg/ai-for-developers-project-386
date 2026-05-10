import { Badge, Button, Card, Stack, Text } from '@mantine/core';
import type { DaySlots } from '../../api/queries/slots';
import { formatDayHeader, formatSlotTime, statusColor, statusLabel } from './slot-utils';

type Props = {
  day: DaySlots;
  timezone: string;
  selectedSlot: string | null;
  onSelect: (slotIso: string) => void;
};

export function DayColumn({ day, timezone, selectedSlot, onSelect }: Props) {
  const { weekday, date } = formatDayHeader(day.date);
  return (
    <Card withBorder padding="sm" radius="md" h="100%">
      <Stack gap="xs" h="100%">
        <Stack gap={2}>
          <Text fw={600} size="sm">
            {weekday}
          </Text>
          <Text size="xs" c="dimmed">
            {date}
          </Text>
          <Badge color={statusColor(day.status)} variant="light" size="sm" mt={4}>
            {statusLabel(day.status)}
          </Badge>
        </Stack>
        {day.status === 'open' && day.slots.length > 0 && (
          <Stack gap={4}>
            {day.slots.map((slot) => {
              const isSelected = slot === selectedSlot;
              return (
                <Button
                  key={slot}
                  size="xs"
                  variant={isSelected ? 'filled' : 'light'}
                  fullWidth
                  onClick={() => onSelect(slot)}
                  aria-pressed={isSelected}
                >
                  {formatSlotTime(slot, timezone)}
                </Button>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
