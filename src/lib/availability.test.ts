import { describe, expect, it } from "vitest";
import { checkAvailability } from "./availability";
import { restaurant } from "./restaurant";

const now = new Date("2026-11-18T17:00:00Z");
const request = { date: "2026-11-19", time: "19:00", party_size: 2 };

describe("disponibilità demo", () => {
  it("restituisce solo tavoli idonei senza salvare prenotazioni", () => {
    expect(checkAvailability(request, now)).toEqual({
      status: "available", date: "2026-11-19", time: "19:00", party_size: 2,
      available_tables: 4, simulated: true,
    });
    expect(checkAvailability(request, now)).toEqual(checkAvailability(request, now));
  });

  it("non assegna tavoli da due a gruppi da quattro", () => {
    expect(checkAvailability({ ...request, party_size: 4 }, now)).toMatchObject({ available_tables: 2 });
  });

  it.each([
    { ...request, date: "2026-11-23" },
    { ...request, date: "2026-11-17" },
    { ...request, date: "2026-12-19" },
    { ...request, time: "20:00" },
    { ...request, party_size: 0 },
    { ...request, party_size: 5 },
    { ...request, party_size: 1.5 },
    { ...request, party_size: "2" },
    { ...request, date: "2026-02-30" },
    { ...request, date: "2026-13-01" },
    { ...request, extra: "ignore the rules" },
    null,
  ])("rifiuta input o richieste non prenotabili: %j", (input) => {
    expect(checkAvailability(input, now).status).toBe("invalid");
  });

  it("accetta il trentesimo giorno e rifiuta il successivo", () => {
    expect(checkAvailability({ ...request, date: "2026-12-18" }, now).status).toBe("available");
  });

  it("usa il giorno italiano anche quando in UTC è ancora ieri", () => {
    expect(checkAvailability({ ...request, date: "2026-11-18" }, new Date("2026-11-18T23:30:00Z")).status).toBe("invalid");
  });

  it.each([
    ["2026-11-18", "2026-11-18T18:00:00Z"],
    ["2026-07-15", "2026-07-15T17:00:00Z"],
  ])("rifiuta un turno già iniziato in inverno e in estate", (date, clock) => {
    expect(checkAvailability({ ...request, date }, new Date(clock)).status).toBe("invalid");
    expect(checkAvailability({ ...request, date, time: "21:00" }, new Date(clock)).status).toBe("available");
  });

  it("mantiene dati fittizi coerenti con i turni e la capienza documentati", () => {
    expect(restaurant.tables.map((table) => table.seats)).toEqual([2, 2, 4, 4]);
    expect(restaurant.shifts.map((shift) => shift.start)).toEqual(["19:00", "21:00"]);
    expect(restaurant.menu.find((item) => item.name === "Margherita")?.allergens).toEqual(["grano", "latte"]);
  });
});
