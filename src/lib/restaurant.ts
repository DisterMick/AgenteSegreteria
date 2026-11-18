import { z } from "zod";
import data from "@/data/restaurant.json";

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const restaurant = z.strictObject({
  name: z.string().min(1),
  version: z.number().int().positive(),
  reviewed_on: z.iso.date(),
  timezone: z.literal("Europe/Rome"),
  opening_days: z.array(z.number().int().min(0).max(6)).min(1),
  hours: z.strictObject({ opens: time, closes: time }),
  booking_horizon_days: z.literal(30),
  max_party_size: z.literal(4),
  shifts: z.array(z.strictObject({ start: time, end: time })).min(1),
  tables: z.array(z.strictObject({ id: z.string().min(1), seats: z.number().int().positive() })).min(1),
  menu: z.array(z.strictObject({
    name: z.string().min(1), ingredients: z.string().min(1), allergens: z.array(z.string().min(1)),
  })).min(1),
  services: z.array(z.string().min(1)),
  allergen_notice: z.string().min(1),
}).parse(data);

export function restaurantClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: restaurant.timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(({ type, value }) => [type, value]));

  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
