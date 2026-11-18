import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { availabilityRequestSchema, checkAvailability } from "./availability";
import { restaurant } from "./restaurant";

const detailsSchema = availabilityRequestSchema.extend({ name: z.string().trim().min(1).max(80) });
const reservationSchema = detailsSchema.extend({
  id: z.uuid(), session_id: z.string().min(1), revision: z.number().int().nonnegative(),
  table_id: z.enum(restaurant.tables.map((table) => table.id)), created_at: z.iso.datetime(),
});
export type Reservation = z.infer<typeof reservationSchema>;

// shortcut: archivio su un solo disco locale; usare un database prima di distribuire su più host.
export class Reservations {
  constructor(readonly path = join(process.cwd(), ".local", "reservations.json")) {}

  read(): Reservation[] {
    if (!existsSync(this.path)) return [];
    return z.array(reservationSchema).parse(JSON.parse(readFileSync(this.path, "utf8")));
  }

  save(sessionId: string, revision: number, input: unknown, now = new Date()): Reservation {
    const details = detailsSchema.parse(input);
    mkdirSync(dirname(this.path), { recursive: true });
    const lock = openSync(`${this.path}.lock`, "wx", 0o600);
    try {
      const rows = this.read();
      const previous = rows.find((row) => row.session_id === sessionId && row.revision === revision);
      if (previous) {
        if (Object.entries(details).some(([key, value]) => previous[key as keyof Reservation] !== value)) throw new Error("IDEMPOTENCY_CONFLICT");
        return previous;
      }
      const { name: _name, ...request } = details;
      void _name;
      const available = checkAvailability(request, now, rows);
      if (available.status !== "available") throw new Error(available.status === "unavailable" ? "NO_AVAILABILITY" : "INVALID_AVAILABILITY");
      const table = [...restaurant.tables].sort((a, b) => a.seats - b.seats || a.id.localeCompare(b.id))
        .find((table) => table.seats >= details.party_size && !rows.some((row) => row.date === details.date && row.time === details.time && row.table_id === table.id))!;
      const row = reservationSchema.parse({ ...details, id: randomUUID(), session_id: sessionId, revision, table_id: table.id, created_at: now.toISOString() });
      writeFileSync(`${this.path}.tmp`, JSON.stringify([...rows, row], null, 2), { mode: 0o600 });
      renameSync(`${this.path}.tmp`, this.path);
      return row;
    } finally { closeSync(lock); unlinkSync(`${this.path}.lock`); }
  }
}

export const reservations = new Reservations();
