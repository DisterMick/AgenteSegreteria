import { z } from "zod";
import { restaurant, restaurantClock } from "./restaurant";

export const availabilityRequestSchema = z.strictObject({
  date: z.iso.date(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  party_size: z.number().int().min(1).max(restaurant.max_party_size),
});

export type AvailabilityResult =
  | { status: "invalid"; message: string }
  | { status: "unavailable"; message: string }
  | { status: "available"; date: string; time: string; party_size: number; available_tables: number; simulated: true };

export type OccupiedTable = { date: string; time: string; table_id: string };

export function checkAvailability(input: unknown, now = new Date(), occupied: OccupiedTable[] = []): AvailabilityResult {
  const parsed = availabilityRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", message: "Controlla data, turno e numero di persone (da 1 a 4)." };
  }

  const { date, time, party_size } = parsed.data;
  const clock = restaurantClock(now);
  const lastDay = new Date(`${clock.date}T00:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() + restaurant.booking_horizon_days);

  if (date < clock.date || date > lastDay.toISOString().slice(0, 10)) {
    return { status: "invalid", message: "Scegli una data da oggi ai prossimi 30 giorni." };
  }
  if (!restaurant.opening_days.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) {
    return { status: "invalid", message: "Il lunedì la pizzeria è chiusa. Scegli un altro giorno." };
  }
  if (!restaurant.shifts.some((shift) => shift.start === time)) {
    return { status: "invalid", message: "I turni disponibili iniziano alle 19:00 e alle 21:00." };
  }
  if (date === clock.date && time <= clock.time) {
    return { status: "invalid", message: "Questo turno è già iniziato. Scegli un turno futuro." };
  }

  const available = restaurant.tables.filter((table) => table.seats >= party_size
    && !occupied.some((booking) => booking.date === date && booking.time === time && booking.table_id === table.id));
  if (!available.length) return { status: "unavailable", message: "Non ci sono tavoli adatti disponibili per questo turno. Scegli un altro turno." };
  return {
    status: "available", date, time, party_size,
    available_tables: available.length,
    simulated: true,
  };
}
