import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { BookingController } from "../src/lib/agent/booking";
import { actionSchema } from "../src/lib/agent/harness";
import { handoffPath } from "../src/lib/handoffs";
import { Reservations } from "../src/lib/reservations";
import { restaurant } from "../src/lib/restaurant";
import { controllerLine } from "../src/lib/voice/lines";
import type { Conversation } from "./scenarios";

export const callerReply = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("say"), text: z.string().trim().min(1).max(1500) }),
  z.strictObject({ type: z.enum(["hangup", "silence"]) }),
]);
export const agentReply = z.union([
  z.strictObject({ text: z.string().trim().min(1).max(2000) }), z.strictObject({ action: actionSchema }),
]);
export type Line = { speaker: "cliente" | "agente"; text: string };
export type Participants = {
  caller(brief: Conversation["caller"], lines: Line[]): Promise<unknown>;
  receptionist(clock: Date, lines: Line[], results: unknown[], revision: number): Promise<unknown>;
  judge?(rules: Pick<Conversation["expect"], "must" | "must_not">, lines: Line[]): Promise<boolean>;
  cost(): number;
};

export type Attempt = {
  id: string; turns: number; events: string[]; tools: string[]; problems: string[]; usd: number;
  verified: boolean; semantic: "pass" | "fail" | "unchecked"; stop?: string;
};

// Only literal, pre-written customer turns are used for adversarial fixtures.
export function fixedCaller(lines: string[], final: "silence" | "hangup" = "hangup") {
  let index = 0;
  return async () => index < lines.length ? { type: "say", text: lines[index++] } : { type: final };
}

export async function runCase(s: Conversation, roles: Participants): Promise<Attempt> {
  const dir = mkdtempSync(join(tmpdir(), "pizzeria-scenario-"));
  const result: Attempt = { id: s.id, turns: 0, events: [], tools: [], problems: [], usd: 0, verified: false, semantic: "unchecked" };
  const started = roles.cost();
  const session = randomUUID();
  const archive = new Reservations(join(dir, "reservations.json"));
  let now = new Date(s.clock);
  const lines: Line[] = [];
  const say = (text: string) => lines.push({ speaker: "agente", text });
  const faults = s.setup?.faults ?? [];
  const controller = new BookingController(session, {
    path: archive.path, read: () => archive.read(),
    save: (...args) => {
      if (faults.includes("db_down_before_write")) throw new Error("DISK_UNAVAILABLE");
      const row = archive.save(...args);
      if (faults.includes("timeout_after_commit")) throw new Error("COMMIT_TIMEOUT");
      return row;
    },
  });
  try {
    for (const [i, f] of (s.setup?.occupied ?? []).entries()) {
      const table = restaurant.tables.find(t => t.id === f.resource);
      const row = archive.save("fixture-" + i, 0, { date: f.date, time: f.time, party_size: table?.seats, name: f.name ?? "Fixture" }, now);
      if (row.table_id !== f.resource) throw new Error("FIXTURE_TABLE");
    }
    const before = archive.read();
    let firstSummary = true;
    const history: unknown[] = [];
    // Some cases end when the customer hangs up after the last allowed exchange.
    for (;;) {
      const next = callerReply.parse(await roles.caller(s.caller, lines));
      if (next.type !== "say") { result.events.push(next.type === "silence" ? "INPUT_TIMEOUT" : "CALL_ENDED"); break; }
      if (++result.turns > s.expect.max_turns) { result.problems.push("TURN_LIMIT"); break; }
      const turn = String(result.turns);
      lines.push({ speaker: "cliente", text: next.text });
      controller.beginTurn(turn);
      const outcome = controller.finishTurn(turn, next.text, now)!;
      result.events.push(outcome.code);
      if (outcome.reason) result.events.push(outcome.reason);
      history.push({ turn, code: outcome.code, reason: outcome.reason });
      if (outcome.code === "RESERVATION_SAVED") {
        say("Prenotazione confermata. Il tuo codice è " + outcome.reservation!.code + ". A presto!");
        break;
      }
      const fixed = controllerLine(outcome.code);
      if (fixed) {
        say(fixed);
        if (["HANDOFF_REQUESTED", "HANDOFF_FAILED", "USER_DECLINED", "SAVE_FAILED"].includes(outcome.code)) break;
        continue;
      }
      for (let step = 0; step < 8; step++) {
        const retry = step === 0 && outcome.code === "CONFIRMATION_REQUIRED" && outcome.reason !== "STALE_CONFIRMATION";
        const reply = retry ? { action: { type: "prepare_confirmation" as const, expected_revision: controller.state.revision } }
          : agentReply.parse(await roles.receptionist(now, lines, history, controller.state.revision));
        if ("text" in reply) { say(reply.text); break; }
        const tool = controller.act(reply.action, now);
        result.tools.push(reply.action.type);
        result.events.push(tool.code);
        history.push({ action: reply.action, result: tool });
        if (controller.pending) {
          const question = controller.pending.question;
          if (s.id === "V14" && firstSummary) {
            say(question.slice(0, Math.floor(question.length / 2)));
            controller.interruptSummary();
            result.events.push("SUMMARY_INTERRUPTED");
          } else {
            say(question);
            result.events.push(controller.summaryDelivered(question, true, true));
          }
          if (s.id === "C04" && firstSummary) now = new Date(now.getTime() + 180_000);
          firstSummary = false;
          break;
        }
        const line = controllerLine(tool.code);
        if (line) { say(line); break; }
        if (step === 7) result.problems.push("TOOL_LOOP");
      }
      if (controller.handoff || result.problems.length) break;
    }

    if (!lines.some(line => line.speaker === "agente")) result.problems.push("NO_AGENT_REPLY");
    const rows = new Reservations(archive.path).read();
    if (!isDeepStrictEqual(rows.filter(row => row.session_id !== session), before)) result.problems.push("FIXTURES_CHANGED");
    const booked = rows.filter(row => row.session_id === session).map(({ date, time, party_size, name }) => ({ date, time, party_size, name }));
    if (!isDeepStrictEqual(booked, s.expect.reservations)) result.problems.push("RESERVATIONS");
    const path = handoffPath(archive.path, session);
    const reason = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).reason : null;
    if (reason !== (s.expect.handoff ?? null)) result.problems.push("HANDOFF");
    for (const code of s.expect.events_must ?? []) if (!result.events.includes(code)) result.problems.push("MISSING_" + code);
    for (const code of s.expect.events_must_not ?? []) if (result.events.includes(code)) result.problems.push("FORBIDDEN_" + code);
    result.verified = true;
    if (roles.judge && (s.expect.must?.length || s.expect.must_not?.length)) {
      result.semantic = await roles.judge({ must: s.expect.must, must_not: s.expect.must_not }, lines) ? "pass" : "fail";
    }
  } catch (error) {
    // Store only local error codes; provider bodies or free text never enter a report.
    const message = error instanceof Error ? error.message : "";
    result.stop = ["BUDGET_LIMIT", "PROVIDER_ERROR", "UNKNOWN_USAGE", "FIXTURE_TABLE"].includes(message) ? message : "INVALID_STEP";
    if (!result.verified) result.problems.push(result.stop);
  } finally {
    result.usd = roles.cost() - started;
    rmSync(dir, { recursive: true, force: true });
  }
  return result;
}

export function score(attempts: Attempt[]) {
  const valid = attempts.filter(r => /^V\d\d$/.test(r.id));
  const finished = valid.filter(r => r.verified);
  const correct = finished.filter(r => !r.problems.length).length;
  const complete = Array.from({ length: 20 }, (_, i) => "V" + String(i + 1).padStart(2, "0"))
    .every(id => finished.filter(r => r.id === id).length === 3);
  return { correct, finished: finished.length, planned: 60, complete,
    percent: complete ? 100 * correct / 60 : null };
}
