import { z } from "zod";

export const bookingRequestSchema = z.strictObject({
  date: z.iso.date(),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  party_size: z.number().int(),
});

type Request = z.infer<typeof bookingRequestSchema>;
export type OccupiedTable = { date: string; time: string; table_id: string };
type Schedule = {
  opening_days: number[]; closed_dates: string[]; booking_horizon_days: number; max_party_size: number;
  shifts: { start: string; end: string }[]; tables: { id: string; seats: number }[];
};

export function fittingTables(request: Request, schedule: Schedule, occupied: OccupiedTable[]) {
  const taken = new Set(occupied.filter(row => row.date === request.date && row.time === request.time).map(row => row.table_id));
  return schedule.tables.filter(table => table.seats >= request.party_size && !taken.has(table.id))
    .sort((a, b) => a.seats - b.seats || a.id.localeCompare(b.id));
}

export function evaluateAvailability(input: unknown, schedule: Schedule, clock: { date: string; time: string }, occupied: OccupiedTable[]) {
  const parsed = bookingRequestSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", code: "INVALID_INPUT" } as const;
  const request = parsed.data;
  if (request.party_size < 1 || request.party_size > schedule.max_party_size)
    return { status: "invalid", code: "PARTY_SIZE_OUT_OF_RANGE", params: { min: 1, max: schedule.max_party_size } } as const;
  const last = new Date(`${clock.date}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() + schedule.booking_horizon_days);
  if (request.date < clock.date || request.date > last.toISOString().slice(0, 10))
    return { status: "invalid", code: "DATE_OUT_OF_RANGE", params: { days: schedule.booking_horizon_days } } as const;
  const weekday = new Date(`${request.date}T00:00:00Z`).getUTCDay();
  if (!schedule.opening_days.includes(weekday) || schedule.closed_dates.includes(request.date))
    return { status: "invalid", code: "CLOSED_DAY", params: { date: request.date, weekday } } as const;
  const starts = schedule.shifts.map(s => s.start);
  const tables = fittingTables(request, schedule, occupied);
  if (starts.includes(request.time) && (request.date > clock.date || request.time > clock.time) && tables.length)
    return { status: "available", ...request, available_tables: tables.length, simulated: true } as const;

  const alternatives = starts.filter(time => (request.date > clock.date || time > clock.time)
    && fittingTables({ ...request, time }, schedule, occupied).length > 0).sort();
  if (!starts.includes(request.time)) return { status: "invalid", code: "INVALID_SHIFT", alternatives } as const;
  if (request.date === clock.date && request.time <= clock.time) return { status: "invalid", code: "SHIFT_STARTED", alternatives } as const;
  return { status: "unavailable", code: "NO_AVAILABILITY", alternatives } as const;
}
