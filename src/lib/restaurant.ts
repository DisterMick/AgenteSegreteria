import { z } from "zod";
import data from "../../config/tenants/pizzeria-demo/restaurant.json";

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

const phoneNumber = z.string().trim().transform(n => n.replace(/[ ()-]/g, "").replace(/^00/, "+"))
  .pipe(z.string().regex(/^\+[1-9]\d{6,14}$/, "Usare il prefisso internazionale")).nullable();
const channelSchema = z.discriminatedUnion("first_speaker", [
  z.strictObject({ first_speaker: z.literal("caller"), greeting: z.string().trim().min(1).max(250).nullable() }),
  z.strictObject({ first_speaker: z.literal("agent"), greeting: z.string().trim().min(1).max(250) }),
]);

export const restaurantSchema = z.strictObject({
  phone: z.strictObject({ main_number: phoneNumber, handoff_number: phoneNumber })
    .refine(p => p.main_number === null || p.main_number !== p.handoff_number, "Il numero del personale deve essere diverso dalla linea principale")
    .default({ main_number: null, handoff_number: null }),
  channels: z.strictObject({ web: channelSchema, phone: channelSchema }).default({
    web: { first_speaker: "caller", greeting: null }, phone: { first_speaker: "agent", greeting: "Buonasera, come posso aiutarla?" },
  }),
  name: z.string().min(1),
  version: z.number().int().positive(),
  reviewed_on: z.iso.date(),
  timezone: z.string().min(1).refine(value => {
    try { new Intl.DateTimeFormat("it", { timeZone: value }); return true; } catch { return false; }
  }),
  opening_days: z.array(z.number().int().min(0).max(6)).min(1),
  closed_dates: z.array(z.iso.date()),
  hours: z.strictObject({ opens: time, closes: time }),
  booking_horizon_days: z.number().int().nonnegative(),
  max_party_size: z.number().int().positive(),
  shifts: z.array(z.strictObject({ start: time, end: time })).min(1),
  tables: z.array(z.strictObject({ id: z.string().min(1), seats: z.number().int().positive() })).min(1),
  menu: z.array(z.strictObject({
    name: z.string().min(1), ingredients: z.string().min(1), allergens: z.array(z.string().min(1)),
  })).min(1),
  services: z.array(z.string().min(1)),
  allergen_notice: z.string().min(1),
}).refine(r => new Set(r.tables.map(t => t.id)).size === r.tables.length && r.tables.some(t => t.seats >= r.max_party_size),
  "Tavoli duplicati o capienza insufficiente")
  .refine(r => r.shifts.every(s => r.hours.opens <= s.start && s.start < s.end && s.end <= r.hours.closes
    && !r.shifts.some(other => other !== s && s.start < other.end && other.start < s.end)), "Turni sovrapposti o fuori orario");

export const restaurant = restaurantSchema.parse(data);
export type VoiceChannel = keyof typeof restaurant.channels;
export function openingGreeting(channel: VoiceChannel, channels = restaurant.channels) {
  const setting = channels[channel];
  return setting.first_speaker === "agent" ? setting.greeting : null;
}

export function restaurantClock(now = new Date(), timeZone = restaurant.timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(({ type, value }) => [type, value]));

  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
