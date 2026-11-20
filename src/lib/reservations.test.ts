import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { Reservations } from "./reservations";
import { checkAvailability } from "./availability";

let directory: string;
let store: Reservations;
const now = new Date("2026-11-18T12:00:00Z");
const details = { date: "2026-11-18", time: "21:00", party_size: 2, name: "Cliente Test" };
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "pizzeria-reservations-")); store = new Reservations(join(directory, "bookings.json")); });
afterEach(() => rmSync(directory, { recursive: true, force: true }));

it("salva una sola prenotazione dopo retry e riavvio, sul tavolo più piccolo", () => {
  const first = store.save("session", 1, details, now);
  expect(first.table_id).toBe("T1");
  const restarted = new Reservations(store.path);
  expect(restarted.save("session", 1, details, now)).toEqual(first);
  expect(restarted.save("session", 5, details, now)).toEqual(first);
  expect(() => restarted.save("session", 6, { ...details, time: "19:00" }, now)).toThrow("IDEMPOTENCY_CONFLICT");
  expect(restarted.read()).toHaveLength(1);
  expect(() => restarted.save("session", 1, { ...details, name: "Altro" }, now)).toThrow("IDEMPOTENCY_CONFLICT");
});

it("ricontrolla i posti sotto lock e non sovraprenota l'ultimo tavolo", () => {
  const request = { ...details, party_size: 4 };
  expect(store.save("one", 1, request, now).table_id).toBe("T3");
  expect(new Reservations(store.path).save("two", 1, request, now).table_id).toBe("T4");
  expect(() => store.save("three", 1, request, now)).toThrow("NO_AVAILABILITY");
  expect(checkAvailability({ date: request.date, time: request.time, party_size: 4 }, now, store.read()).status).toBe("unavailable");
  expect(store.save("three", 1, { ...request, time: "19:00" }, now).table_id).toBe("T3");
});

it("non perde dati per lock occupato, file corrotto o input non valido", () => {
  store.save("one", 1, details, now);
  const contents = readFileSync(store.path, "utf8");
  writeFileSync(`${store.path}.lock`, "locked");
  expect(() => store.save("two", 1, details, now)).toThrow();
  expect(readFileSync(store.path, "utf8")).toBe(contents);
  rmSync(`${store.path}.lock`);
  expect(() => store.save("two", 1, { ...details, date: "2026-11-23" }, now)).toThrow("INVALID_AVAILABILITY");
  writeFileSync(store.path, "broken");
  expect(() => store.save("two", 1, details, now)).toThrow();
  expect(readFileSync(store.path, "utf8")).toBe("broken");
});
