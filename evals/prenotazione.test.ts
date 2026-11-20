import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { BookingController } from "@/lib/agent/booking";
import { Reservations } from "@/lib/reservations";

const now = new Date("2026-11-19T17:00:00Z");
const tonight = { date: "2026-11-19", time: "21:00", party_size: 2 };
let directory: string, archive: Reservations, agent: BookingController;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "eval-prenotazione-"));
  archive = new Reservations(join(directory, "prenotazioni.json"));
  agent = new BookingController("ospite", archive);
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function propose(action: Record<string, unknown>) {
  return agent.act({ expected_revision: agent.state.revision, ...action }, now);
}
function hearAndAnswer(name: string, spokenSummary: string, answer: string) {
  expect(propose({ type: "prepare_confirmation", name }).code).toBe("AWAITING_USER_CONFIRMATION");
  expect(agent.summaryDelivered(spokenSummary, true, true)).toBe("SUMMARY_READY");
  agent.beginTurn(`turno-${agent.state.revision}`);
  return agent.finishTurn(`turno-${agent.state.revision}`, answer, now);
}
const summary = "Confermi la prenotazione per il diciannove novembre duemilaventisei alle ventuno, per due persone, a nome Ada Test?";

it("E01 · oggi alle 21 per due, un sì e una ricevuta anche dopo riapertura dell’archivio", () => {
  expect(propose({ type: "check_availability", details: tonight }).code).toBe("AVAILABILITY_CHECKED");
  const result = hearAndAnswer("Ada Test", summary, "Sì, confermo, grazie.");
  expect(result?.code).toBe("RESERVATION_SAVED");
  expect(propose({ type: "prepare_confirmation", name: "Altro nome" }).code).toBe("RESERVATION_ALREADY_SAVED");
  const rows = new Reservations(archive.path).read();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ ...tonight, name: "Ada Test", table_id: "T1", id: agent.reservation?.id });
});

it("E02 · il cliente rinuncia e un sì successivo non recupera la prenotazione", () => {
  propose({ type: "check_availability", details: tonight });
  expect(hearAndAnswer("Ada Test", summary, "No grazie")?.code).toBe("USER_DECLINED");
  expect(propose({ type: "prepare_confirmation" }).code).toBe("MISSING_BOOKING_DETAILS");
  agent.beginTurn("saluto"); agent.finishTurn("saluto", "Sì", now);
  expect(new Reservations(archive.path).read()).toEqual([]);
});

it("E05 · corregge il cognome nel riepilogo e salva solo i dati riletti", () => {
  propose({ type: "check_availability", details: tonight });
  expect(hearAndAnswer("Ada Test", summary, "No, il nome è Ada Prova")?.code).toBe("DETAILS_CHANGE_REQUESTED");
  expect(propose({ type: "prepare_confirmation", name: "Ada Test" }).code).toBe("DETAILS_CHANGE_REQUESTED");
  expect(archive.read()).toEqual([]);
  expect(hearAndAnswer("Ada Prova", summary.replace("Ada Test", "Ada Prova"), "Sì, esatto")?.code).toBe("RESERVATION_SAVED");
  expect(new Reservations(archive.path).read().map(r => r.name)).toEqual(["Ada Prova"]);
});

it("E06 · il turno pieno ha un’alternativa reale che richiede una propria conferma", () => {
  for (const guest of ["primo", "secondo"]) archive.save(guest, 1, { ...tonight, party_size: 4, name: "Gruppo Test" }, now);
  const details = { ...tonight, party_size: 4 };
  expect(propose({ type: "check_availability", details })).toMatchObject({ code: "NO_AVAILABILITY", data: { alternatives: ["19:00"] } });
  expect(propose({ type: "prepare_confirmation" }).status).toBe("blocked");
  expect(propose({ type: "check_availability", details: { ...details, time: "19:00" } }).code).toBe("AVAILABILITY_CHECKED");
  const earlier = summary.replace("ventuno", "diciannove").replace("due persone", "quattro persone");
  expect(hearAndAnswer("Ada Test", earlier, "Sì, grazie mille")?.code).toBe("RESERVATION_SAVED");
  const rows = new Reservations(archive.path).read().filter(r => r.session_id === "ospite");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ time: "19:00", table_id: "T3", party_size: 4 });
});
