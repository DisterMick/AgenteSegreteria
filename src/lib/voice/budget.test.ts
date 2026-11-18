import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VoiceBudget } from "./budget";
import { estimateTranscriptionUsd, estimateUsageUsd, realtimeConfig } from "./config";

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
  it("consente quattro tentativi da 0,50 USD e blocca il quinto senza rimborsi", () => {
    for (const id of ["one", "two", "three", "four"]) { budget.reserve(id, now); budget.finish(id); }
    expect(budget.read().dailyCents).toBe(200);
    expect(() => budget.reserve("five", now)).toThrow("DAILY_BUDGET");
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
    expect(estimateUsageUsd({ input_tokens: 2000, output_tokens: 1000, input_token_details: { audio_tokens: 1000 }, output_token_details: { audio_tokens: 500 } })).toBeCloseTo(0.08);
  });
  it("usa una stima prudente quando mancano i dettagli e rifiuta conteggi impossibili", () => {
    expect(estimateUsageUsd({ input_tokens: 1000, output_tokens: 1000 })).toBeCloseTo(0.096);
    expect(() => estimateUsageUsd({ input_tokens: -1, output_tokens: 10 })).toThrow();
    expect(() => estimateUsageUsd({ input_tokens: 1, output_tokens: 0, input_token_details: { audio_tokens: 2 } })).toThrow();
  });
  it("consente frasi complete e controlla dal server i turni e la trascrizione", () => {
    const config = realtimeConfig(now);
    expect(config).toMatchObject({ model: "gpt-realtime-2.1", max_output_tokens: 1024 });
    expect(config.audio.input).toMatchObject({ transcription: { model: "gpt-4o-transcribe", language: "it" }, noise_reduction: { type: "near_field" }, turn_detection: { type: "semantic_vad", eagerness: "low", create_response: false, interrupt_response: true } });
    expect(JSON.stringify(config.tools)).not.toContain("create_reservation");
  });
  it("include i token della trascrizione nella stima prudente e rifiuta uso ignoto", () => {
    expect(estimateTranscriptionUsd({ type: "tokens", input_tokens: 1000, output_tokens: 100 })).toBeCloseTo(0.022);
    expect(() => estimateTranscriptionUsd({ type: "tokens", input_tokens: -1, output_tokens: 1 })).toThrow();
    expect(() => estimateTranscriptionUsd(undefined)).toThrow();
  });
});
