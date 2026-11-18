import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VoiceBudget } from "./budget";
import { estimateUsageUsd, realtimeConfig } from "./config";

let directory: string;
let budget: VoiceBudget;
const now = new Date("2026-11-18T12:00:00Z");
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "pizzeria-voice-")); budget = new VoiceBudget(join(directory, "budget.json")); });
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("plafond vocale persistente", () => {
  it("impedisce sessioni concorrenti e mantiene il plafond dopo un riavvio", () => {
    budget.reserve("one", now);
    expect(() => new VoiceBudget(budget.path).reserve("two", now)).toThrow("CALL_ACTIVE");
    budget.finish("one");
    expect(new VoiceBudget(budget.path).read().reservedCents).toBe(50);
  });
  it("non rimborsa il plafond quando si termina presto e blocca il terzo tentativo del giorno", () => {
    for (const id of ["one", "two"]) { budget.reserve(id, now); budget.finish(id); }
    expect(() => budget.reserve("three", now)).toThrow("DAILY_BUDGET");
  });
  it("resetta solo il plafond giornaliero alla mezzanotte italiana", () => {
    budget.reserve("one", new Date("2026-11-18T22:30:00Z")); budget.finish("one");
    budget.reserve("two", new Date("2026-11-18T23:30:00Z"));
    expect(budget.read()).toMatchObject({ day: "2026-11-19", dailyCents: 50, reservedCents: 100 });
  });
  it("blocca il tetto complessivo anche cambiando giorno", () => {
    for (let day = 1; day <= 18; day++) { const id = String(day); budget.reserve(id, new Date(`2026-11-${String(day).padStart(2, "0")}T12:00:00Z`)); budget.finish(id); }
    expect(() => budget.reserve("nineteen", new Date("2026-11-19T12:00:00Z"))).toThrow("TOTAL_BUDGET");
  });
  it("non azzera file corrotti né ignora una scrittura concorrente", () => {
    writeFileSync(budget.path, "not json");
    expect(() => budget.reserve("one", now)).toThrow();
    writeFileSync(`${budget.path}.lock`, "locked");
    expect(() => budget.reserve("one", now)).toThrow();
  });
  it("correla consumi e chiusura alla sola sessione proprietaria", () => {
    budget.reserve("one", now); budget.attach("one", "rtc_example"); budget.observe("one", 0.01);
    expect(() => budget.finish("other")).toThrow("SESSION_NOT_FOUND");
    expect(budget.read()).toMatchObject({ observedUsd: 0.01, active: { id: "one", callId: "rtc_example", observedUsd: 0.01 } });
  });
});

describe("configurazione e stima costi", () => {
  it("considera separatamente audio e testo senza promettere sconti cache", () => {
    expect(estimateUsageUsd({ input_tokens: 2000, output_tokens: 1000, input_token_details: { audio_tokens: 1000 }, output_token_details: { audio_tokens: 500 } })).toBeCloseTo(0.0218);
  });
  it("usa una stima prudente quando mancano i dettagli e rifiuta conteggi impossibili", () => {
    expect(estimateUsageUsd({ input_tokens: 1000, output_tokens: 1000 })).toBeCloseTo(0.03);
    expect(() => estimateUsageUsd({ input_tokens: -1, output_tokens: 10 })).toThrow();
    expect(() => estimateUsageUsd({ input_tokens: 1, output_tokens: 0, input_token_details: { audio_tokens: 2 } })).toThrow();
  });
  it("fissa modello e limite output sul server e non abilita trascrizione a pagamento separata", () => {
    const config = realtimeConfig(now);
    expect(config).toMatchObject({ model: "gpt-realtime-2.1-mini", max_output_tokens: 256 });
    expect(config.audio.input).not.toHaveProperty("transcription");
    expect(JSON.stringify(config.tools)).not.toContain("create_reservation");
  });
});
