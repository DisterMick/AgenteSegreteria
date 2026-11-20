import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { BookingController } from "../src/lib/agent/booking";
import { handoffPath } from "../src/lib/handoffs";
import { Reservations } from "../src/lib/reservations";

let dir: string, archive: Reservations, agent: BookingController;
const session = "utente-esempio";
const now = new Date("2026-11-18T16:00:00+01:00");
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "handoff-"));
  archive = new Reservations(join(dir, "reservations.json"));
  agent = new BookingController(session, archive);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const request = (reason: string) => ({ type: "request_human_handoff", expected_revision: 0, reason });

it.each(["allergen_question", "user_request"])("I04/I05 registra solo motivo, ora e riferimento per %s", reason => {
  const path = handoffPath(archive.path, session);
  expect(agent.act({ ...request(reason), name: "Rossi" }, now).status).toBe("blocked");
  expect(agent.act({ ...request(reason), expected_revision: 1 }, now).status).toBe("blocked");
  expect(existsSync(path)).toBe(false);
  expect(agent.act(request(reason), now).code).toBe("HANDOFF_REQUESTED");
  const row = JSON.parse(readFileSync(path, "utf8"));
  expect(row).toEqual({ reference: expect.stringMatching(/^[a-f0-9-]{36}$/), at: now.toISOString(), reason });
  const resumed = new BookingController(session, archive);
  expect(resumed.act(request("service_error")).code).toBe("HANDOFF_REQUESTED");
  expect(resumed.handoff).toEqual(row);
  expect(readdirSync(dirname(path))).toHaveLength(1);
  expect(archive.read()).toEqual([]);
});

it.each(["certo, grazie", "no"])("I06 offre il personale dopo due chiarimenti, risposta %s", answer => {
  for (let n = 0; n < 3; n++) {
    const id = String(n);
    agent.beginTurn(id);
    const expected = n === 2 ? "HANDOFF_OFFERED" : "CLARIFICATION_REQUIRED";
    expect(agent.finishTurn(id, "...", now, true)?.code).toBe(expected);
    expect(agent.act({ type: "report_unclear_input", expected_revision: 0 }, now).code).toBe(expected);
  }
  expect(existsSync(handoffPath(archive.path, session))).toBe(false);
  agent.beginTurn("risposta");
  agent.finishTurn("risposta", answer, now);
  expect(agent.handoff?.reason).toBe(answer.startsWith("certo") ? "not_understood" : undefined);
});

it("non annuncia la registrazione se il disco rifiuta la scrittura", () => {
  writeFileSync(join(dir, "handoffs"), "occupato");
  expect(agent.act(request("user_request"), now).code).toBe("HANDOFF_FAILED");
  expect(agent.handoff).toBeNull();
});
