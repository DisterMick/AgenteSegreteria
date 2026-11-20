import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceBudget } from "./budget";
import { RealtimeVoice } from "./service";
import { Reservations } from "../reservations";
import { restaurant } from "../restaurant";

class FakeSocket extends EventEmitter {
  sent: Record<string, unknown>[] = [];
  send(value: string) { this.sent.push(JSON.parse(value)); }
  close() {}
  terminate() {}
}
let directory: string;
let budget: VoiceBudget;
let socket: FakeSocket;
let upstream: ReturnType<typeof vi.fn<typeof fetch>>;
let service: RealtimeVoice;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
  vi.stubEnv("OPENAI_REALTIME_ENABLED", "true"); vi.stubEnv("OPENAI_API_KEY", "test-placeholder");
  directory = mkdtempSync(join(tmpdir(), "pizzeria-service-")); budget = new VoiceBudget(join(directory, "budget.json"));
  socket = new FakeSocket();
  upstream = vi.fn<typeof fetch>().mockImplementation(async (url) => String(url).endsWith("/hangup")
    ? new Response(null, { status: 200 })
    : new Response("v=0\r\nanswer", { status: 201, headers: { Location: "/v1/realtime/calls/rtc_test" } }));
  service = new RealtimeVoice(budget, upstream, () => socket as unknown as WebSocket, new Reservations(join(directory, "bookings.json")));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

async function start(selection?: Parameters<RealtimeVoice["start"]>[2]) {
  const started = service.start("v=0\r\noffer", undefined, selection);
  await vi.advanceTimersByTimeAsync(0);
  socket.emit("open");
  return started;
}
const usage = { input_tokens: 1000, output_tokens: 1000 };
function requestedSummary() {
  const event = socket.sent.findLast(item => item.type === "response.create") as { response?: { metadata?: { summary_key: string } } } | undefined;
  return event?.response?.metadata;
}
const done = (id: string, output: unknown[] = [], tokens = usage) => ({
  type: "response.done", response: { id, status: "completed", metadata: requestedSummary(), usage: tokens, output },
});

describe("sessione Realtime controllata dal server", () => {
  it("non chiama OpenAI né impegna budget se la voce è disabilitata", async () => {
    vi.stubEnv("OPENAI_REALTIME_ENABLED", "false");
    await expect(service.start("v=0")).rejects.toThrow("VOICE_NOT_CONFIGURED");
    expect(upstream).not.toHaveBeenCalled(); expect(budget.read().reservedCents).toBe(0);
  });
  it("tiene chiave e stato sul server e rifiuta una chiusura di altra sessione", async () => {
    const result = await start();
    expect(result.sdp).toContain("answer");
    expect(JSON.stringify(result)).not.toContain("test-placeholder");
    await expect(service.stop("other")).rejects.toThrow("SESSION_NOT_FOUND");
    expect(budget.read().active).not.toBeNull();
    await service.stop(result.id); expect(budget.read().active).toBeNull();
  });
  it("ignora il segnale iniziale nel browser configurato per ascoltare", async () => {
    const { id } = await start();
    expect(() => service.channelReady("other")).toThrow("SESSION_NOT_FOUND");
    service.channelReady(id);
    expect(socket.sent).toHaveLength(0);
  });
  it.each([false, true])("un solo saluto del locale e precedenza al cliente se ha già parlato (%s)", async spoken => {
    const original = restaurant.channels.web;
    try {
      restaurant.channels.web = { first_speaker: "agent", greeting: "Buongiorno dal locale di prova." };
      const { id } = await start();
      if (spoken) await service.handle(id, { type: "input_audio_buffer.speech_started", item_id: "first" });
      service.channelReady(id);
      service.channelReady(id);
      expect(socket.sent.filter(e => e.type === "response.create")).toHaveLength(spoken ? 0 : 1);
      if (!spoken) expect(JSON.stringify(socket.sent)).toContain("Buongiorno dal locale di prova.");
    } finally { restaurant.channels.web = original; }
  });
  it("usa il vero harness per gli strumenti e deduplica le risposte", async () => {
    const { id } = await start();
    const event = done("one", [{ type: "function_call", name: "restaurant_action", call_id: "call_1", arguments: JSON.stringify({ action: { type: "get_restaurant_info", topic: "menu", expected_revision: 0 } }) }]);
    await service.handle(id, event); await service.handle(id, event);
    expect(socket.sent.filter((item) => item.type === "conversation.item.create")).toHaveLength(1);
    expect(JSON.stringify(socket.sent)).toContain("PUBLIC_INFO");
    expect(budget.read().observedUsd).toBeCloseTo(0.096);
  });
  it("annuncia al cliente la registrazione della richiesta al personale", async () => {
    const { id } = await start();
    await service.handle(id, done("human", [{ type: "function_call", name: "restaurant_action", call_id: "c",
      arguments: JSON.stringify({ action: { type: "request_human_handoff", expected_revision: 0, reason: "user_request" } }) }]));
    expect(JSON.stringify(socket.sent)).toContain("HANDOFF_REQUESTED");
    expect(JSON.stringify(socket.sent)).toContain("Ho registrato la richiesta per il personale");
  });
  it("non esegue scritture proposte dal modello", async () => {
    const { id } = await start();
    await service.handle(id, done("one", [{ type: "function_call", name: "restaurant_action", call_id: "call_1", arguments: '{"action":{"type":"create_reservation","expected_revision":0,"confirmed":true}}' }]));
    expect(JSON.stringify(socket.sent)).toContain("INVALID_OR_UNAUTHORIZED_ACTION");
  });
  it("chiude dal server quando scade la durata, senza rimborsare il plafond", async () => {
    await start(); await vi.advanceTimersByTimeAsync(180_001);
    expect(upstream.mock.calls.some(([url]) => String(url).endsWith("/rtc_test/hangup"))).toBe(true);
    expect(budget.read()).toMatchObject({ active: null, reservedCents: 50 });
  });
  it("chiude al limite di costo e se perde il canale di controllo", async () => {
    const { id } = await start();
    await service.handle(id, done("expensive", [], { input_tokens: 20_000, output_tokens: 20_000 }));
    expect(budget.read().active).toBeNull();
    const next = start(); await next;
    socket.emit("close"); await vi.advanceTimersByTimeAsync(0);
    expect(budget.read().active).toBeNull();
  });
  it("non libera una chiamata se OpenAI non conferma la chiusura", async () => {
    const { id } = await start();
    upstream.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(service.stop(id)).rejects.toThrow("CLOSE_PENDING");
    expect(budget.read().active?.id).toBe(id);
    await expect(service.start("v=0")).rejects.toThrow("CALL_ACTIVE");
  });
  it("riconcilia una chiamata persistita dopo il riavvio prima di consentirne altre", async () => {
    budget.reserve("orphan"); budget.attach("orphan", "rtc_previous");
    await service.status();
    expect(upstream.mock.calls[0][0]).toContain("rtc_previous/hangup");
    expect(budget.read()).toMatchObject({ active: null, reservedCents: 50 });
  });
  it("non azzera una creazione dal risultato incerto", async () => {
    upstream.mockRejectedValue(new Error("timeout"));
    await expect(service.start("v=0")).rejects.toThrow();
    expect(budget.read().active).not.toBeNull();
    expect((await service.status()).ready).toBe(false);
  });
  it("chiude anche quando si supera il numero di risposte o si modifica il limite output", async () => {
    const first = await start();
    for (let index = 0; index < 24; index++) await service.handle(first.id, done(String(index), [], { input_tokens: 0, output_tokens: 0 }));
    expect(budget.read().active).toBeNull();
    const second = await start();
    await service.handle(second.id, { type: "session.updated", session: { model: "gpt-realtime-2.1", max_output_tokens: "inf" } });
    expect(budget.read().active).toBeNull();
  });
  it("conteggia una risposta interrotta senza eseguire i suoi strumenti incompleti", async () => {
    const { id } = await start();
    const event = done("interrupted", [{ type: "function_call", name: "restaurant_action", call_id: "call_1", arguments: "{}" }]);
    await service.handle(id, { ...event, response: { ...event.response, status: "cancelled" } });
    expect(socket.sent).toHaveLength(0); expect(budget.read().observedUsd).toBeCloseTo(0.096);
  });

  it("salva dalla voce solo dopo riepilogo riprodotto e nuovo sì, senza esporre la sessione", async () => {
    const { id } = await start();
    const tool = async (responseId: string, action: unknown) => service.handle(id, done(responseId, [{ type: "function_call", name: "restaurant_action", call_id: responseId, arguments: JSON.stringify({ action }) }], { input_tokens: 0, output_tokens: 0 }));
    await tool("check", { type: "check_availability", expected_revision: 0, details: { date: "2026-11-18", time: "21:00", party_size: 2 } });
    await tool("name", { type: "prepare_confirmation", expected_revision: 1, name: "Cliente Test" });
    const sent = socket.sent.at(-1) as { response: { instructions: string } };
    expect(sent.response.instructions).toContain("Confermi la prenotazione");
    const question = 'Confermi la prenotazione per il 18/11/2026 alle 21:00, per 2 persone, a nome Cliente Test?';
    await service.handle(id, done("summary", [{ type: "message", content: [{ transcript: question }] }], { input_tokens: 0, output_tokens: 0 }));
    await service.handle(id, { type: "output_audio_buffer.stopped", response_id: "summary" });
    await service.handle(id, { type: "input_audio_buffer.speech_started", item_id: "yes" });
    const transcript = { type: "conversation.item.input_audio_transcription.completed", item_id: "yes", transcript: "Sì, confermo", usage: { type: "tokens", input_tokens: 10, output_tokens: 2 } };
    await service.handle(id, transcript); await service.handle(id, transcript);
    expect(new Reservations(join(directory, "bookings.json")).read()).toHaveLength(1);
    expect((await service.status(id)).session?.reservation).toMatchObject({ name: "Cliente Test", time: "21:00" });
    expect((await service.status("other")).session).toBeNull();
    expect(JSON.stringify(socket.sent)).toContain("RESERVATION_SAVED");
    expect(JSON.stringify(socket.sent)).not.toContain(id);
    expect(budget.read().observedUsd).toBeCloseTo(0.00024);
    await service.stop(id);
    expect((await service.status(id)).receipt).toMatchObject({ name: "Cliente Test", date: "2026-11-18", time: "21:00" });
    expect((await service.status("different")).receipt).toBeNull();
    expect((await service.status()).receipt).toBeNull();
  });

  it("usa e contabilizza il modello scelto nella singola chiamata", async () => {
    const { id } = await start({ model: "gpt-realtime-2.1-mini", voice: "cedar" });
    const form = upstream.mock.calls[0][1]?.body as FormData;
    expect(JSON.parse(String(form.get("session")))).toMatchObject({ model: "gpt-realtime-2.1-mini", audio: { output: { voice: "cedar" } } });
    await service.handle(id, done("mini"));
    expect(budget.read()).toMatchObject({ reservedCents: 50, observedUsd: 0.03 });
    await service.handle(id, { type: "session.updated", session: { model: "gpt-realtime-2.1", max_output_tokens: 1024 } });
    expect(budget.read().active).toBeNull();
  });

  it.each(["corretto", "risposta estranea", "audio interrotto", "assenso incerto"])("gestisce il sì trascritto prima di response.done con %s", async scenario => {
    const { id } = await start();
    const output = (event: string, items: unknown[]) => done(event, items, { input_tokens: 0, output_tokens: 0 });
    for (const [i, action] of [
      { type: "check_availability", expected_revision: 0, details: { date: "2026-11-18", time: "21:00", party_size: 2 } },
      { type: "prepare_confirmation", expected_revision: 1, name: "Cliente Test" },
    ].entries()) await service.handle(id, output(String(i), [{ type: "function_call", name: "restaurant_action", call_id: String(i), arguments: JSON.stringify({ action }) }]));
    const metadata = requestedSummary();
    expect(metadata?.summary_key).toBeTruthy();
    await service.handle(id, { type: "response.created", response: { id: "summary", metadata } });
    if (scenario !== "audio interrotto") await service.acknowledgePlayback(id, { type: "playback_finished", response_id: "summary" });
    await service.handle(id, { type: "input_audio_buffer.speech_started", item_id: "yes" });
    await service.handle(id, { type: "conversation.item.input_audio_transcription.completed", item_id: "yes", transcript: "Sì, va benissimo!", usage: { type: "tokens", input_tokens: 2, output_tokens: 4 },
      logprobs: [{ token: "Sì", logprob: scenario === "assenso incerto" ? -2 : -0.01 }, { token: "!", logprob: -4 }] });
    const store = new Reservations(join(directory, "bookings.json"));
    expect(store.read()).toHaveLength(0);
    const final = output("summary", [{ type: "message", content: [{ transcript: "Confermi la prenotazione per il 18 novembre 2026 alle ventuno, per due persone, a nome Cliente Test?" }] }]);
    if (scenario === "risposta estranea") final.response.metadata = { summary_key: "old" };
    await service.handle(id, final);
    await vi.advanceTimersByTimeAsync(2001);
    expect(store.read()).toHaveLength(scenario === "corretto" ? 1 : 0);
    if (scenario === "assenso incerto") {
      const log = readFileSync(join(directory, "voice-events.jsonl"), "utf8");
      expect(log).toContain("TRANSCRIPTION_UNCERTAIN"); expect(log).not.toContain("benissimo");
    }
  });

  it("non conferma se il cliente interrompe il riepilogo prima del playback completo", async () => {
    const { id } = await start();
    for (const [index, action] of [
      { type: "check_availability", expected_revision: 0, details: { date: "2026-11-18", time: "21:00", party_size: 2 } },
      { type: "prepare_confirmation", expected_revision: 1, name: "Cliente Test" },
    ].entries()) await service.handle(id, done(String(index), [{ type: "function_call", name: "restaurant_action", call_id: String(index), arguments: JSON.stringify({ action }) }], { input_tokens: 0, output_tokens: 0 }));
    await service.handle(id, done("summary", [{ type: "message", content: [{ transcript: "Confermi la prenotazione per il 18/11/2026 alle 21:00, per 2 persone, a nome Cliente Test?" }] }], { input_tokens: 0, output_tokens: 0 }));
    await service.handle(id, { type: "output_audio_buffer.stopped", response_id: "older-response" });
    await service.handle(id, { type: "input_audio_buffer.speech_started", item_id: "early" });
    await service.handle(id, { type: "output_audio_buffer.cleared" });
    await service.handle(id, { type: "conversation.item.input_audio_transcription.completed", item_id: "early", transcript: "Sì", usage: { type: "tokens", input_tokens: 1, output_tokens: 1 } });
    expect(new Reservations(join(directory, "bookings.json")).read()).toEqual([]);
    const message = socket.sent.findLast((event) => (event.item as { role?: string } | undefined)?.role === "system") as { item: { content: { text: string }[] } };
    expect(message.item.content[0].text).toContain('"reason":"SUMMARY_INTERRUPTED"');
  });

  it("attende la fine della risposta interrotta prima di rispondere al nuovo turno", async () => {
    const { id } = await start();
    await service.handle(id, { type: "response.created" });
    await service.handle(id, { type: "input_audio_buffer.speech_started", item_id: "turn" });
    await service.handle(id, { type: "conversation.item.input_audio_transcription.completed", item_id: "turn", transcript: "Che pizze avete?", usage: { type: "tokens", input_tokens: 1, output_tokens: 1 } });
    expect(socket.sent.filter((item) => item.type === "response.create")).toHaveLength(0);
    await service.handle(id, { type: "response.done", response: { id: "cancelled", status: "cancelled", usage: { input_tokens: 0, output_tokens: 0 }, output: [] } });
    expect(socket.sent.filter((item) => item.type === "response.create")).toHaveLength(1);
  });

  it("include la trascrizione nel tetto di costo e chiude senza salvarne il testo", async () => {
    const { id } = await start();
    await service.handle(id, { type: "input_audio_buffer.speech_started", item_id: "turn" });
    await service.handle(id, { type: "conversation.item.input_audio_transcription.completed", item_id: "turn", transcript: "Test", usage: { type: "tokens", input_tokens: 20_000, output_tokens: 1 } });
    expect(budget.read().active).toBeNull();
    expect(budget.read().observedUsd).toBeGreaterThan(0.4);
  });

  it("la pausa blocca anche una richiesta diretta prima di impegnare quote o chiamare OpenAI", async () => {
    writeFileSync(join(directory, "voice-paused"), "");
    await expect(service.start("v=0")).rejects.toThrow("VOICE_PAUSED");
    expect((await service.status()).ready).toBe(false);
    expect(upstream).not.toHaveBeenCalled(); expect(budget.read().reservedCents).toBe(0);
  });
  it("con il modello completo anticipa lo stop a 0,30 USD senza aumentare la quota", async () => {
    const { id } = await start();
    for (let index = 0; index < 3; index++) await service.handle(id, done(`priced_${index}`));
    expect(budget.read().active).not.toBeNull();
    await service.handle(id, done("priced_3"));
    expect(budget.read()).toMatchObject({ active: null, reservedCents: 50 });
    expect(budget.read().observedUsd).toBeCloseTo(0.384);
  });

  it("accetta il riscontro browser tardivo soltanto nella propria sessione e salva una volta dal sì ASR", async () => {
    const { id } = await start();
    for (const [index, action] of [
      { type: "check_availability", expected_revision: 0, details: { date: "2026-11-18", time: "21:00", party_size: 2 } },
      { type: "prepare_confirmation", expected_revision: 1, name: "Nome Privato" },
    ].entries()) await service.handle(id, done(String(index), [{ type: "function_call", name: "restaurant_action", call_id: String(index), arguments: JSON.stringify({ action }) }], { input_tokens: 0, output_tokens: 0 }));
    const question = "Confermi la prenotazione per il diciotto novembre duemilaventisei alle ventuno, per due persone, a nome Nome Privato?";
    await service.handle(id, done("summary", [{ type: "message", content: [{ transcript: question }] }], { input_tokens: 0, output_tokens: 0 }));
    await service.handle(id, { type: "input_audio_buffer.speech_started", item_id: "yes" });
    await expect(service.acknowledgePlayback("other", { type: "playback_finished", response_id: "summary" })).rejects.toThrow("SESSION_NOT_FOUND");
    await service.acknowledgePlayback(id, { type: "playback_finished", response_id: "unknown" });
    expect(new Reservations(join(directory, "bookings.json")).read()).toEqual([]);
    await service.acknowledgePlayback(id, { type: "playback_finished", response_id: "summary" });
    expect(new Reservations(join(directory, "bookings.json")).read()).toEqual([]);
    await service.handle(id, { type: "conversation.item.input_audio_transcription.completed", item_id: "yes", transcript: "Sì, esatto", usage: { type: "tokens", input_tokens: 1, output_tokens: 1 } });
    expect(new Reservations(join(directory, "bookings.json")).read()).toHaveLength(1);
    const logs = readFileSync(join(directory, "voice-events.jsonl"), "utf8");
    expect(logs).toContain("RESERVATION_SAVED"); expect(logs).toContain("SUMMARY_READY");
    for (const secret of ["Nome Privato", "Sì, esatto", "test-placeholder", id]) expect(logs).not.toContain(secret);
  });

  it("un audio cancellato resta non confermabile anche se cancellazione e riscontro precedono response.done", async () => {
    const { id } = await start();
    for (const [index, action] of [
      { type: "check_availability", expected_revision: 0, details: { date: "2026-11-18", time: "21:00", party_size: 2 } },
      { type: "prepare_confirmation", expected_revision: 1, name: "Cliente Test" },
    ].entries()) await service.handle(id, done(String(index), [{ type: "function_call", name: "restaurant_action", call_id: String(index), arguments: JSON.stringify({ action }) }], { input_tokens: 0, output_tokens: 0 }));
    await service.handle(id, { type: "input_audio_buffer.speech_started", item_id: "early" });
    await service.handle(id, { type: "output_audio_buffer.cleared", response_id: "summary" });
    await service.acknowledgePlayback(id, { type: "playback_finished", response_id: "summary" });
    await service.handle(id, done("summary", [{ type: "message", content: [{ transcript: "Confermi la prenotazione per il 18/11/2026 alle 21:00, per 2 persone, a nome Cliente Test?" }] }], { input_tokens: 0, output_tokens: 0 }));
    await service.handle(id, { type: "conversation.item.input_audio_transcription.completed", item_id: "early", transcript: "Sì", usage: { type: "tokens", input_tokens: 1, output_tokens: 1 } });
    expect(new Reservations(join(directory, "bookings.json")).read()).toEqual([]);
    expect(readFileSync(join(directory, "voice-events.jsonl"), "utf8")).toContain("SUMMARY_INTERRUPTED");
  });

  it("registra limite token ed errori sanitizzati, senza salvare messaggi del provider", async () => {
    const { id } = await start();
    await service.handle(id, { type: "response.done", response: { id: "limited", usage: { input_tokens: 0, output_tokens: 0 }, status: "incomplete", status_details: { reason: "max_output_tokens" }, output: [] } });
    await service.handle(id, { type: "error", error: { code: "rate_limit_exceeded", message: "Nome Privato secret-value" } });
    const logs = readFileSync(join(directory, "voice-events.jsonl"), "utf8");
    expect(logs).toContain("OUTPUT_LIMIT"); expect(logs).toContain("rate_limit_exceeded");
    expect(logs).not.toContain("secret-value"); expect(logs).not.toContain("Nome Privato");
  });

  it.each([true, false])("attende al massimo due secondi il riscontro audio dopo il sì (riscontro: %s)", async (acknowledged) => {
    const { id } = await start();
    for (const [index, action] of [
      { type: "check_availability", expected_revision: 0, details: { date: "2026-11-18", time: "21:00", party_size: 2 } },
      { type: "prepare_confirmation", expected_revision: 1, name: "Cliente Test" },
    ].entries()) await service.handle(id, done(String(index), [{ type: "function_call", name: "restaurant_action", call_id: String(index), arguments: JSON.stringify({ action }) }], { input_tokens: 0, output_tokens: 0 }));
    await service.handle(id, done("summary", [{ type: "message", content: [{ transcript: "Confermi la prenotazione per il 18/11/2026 alle 21:00, per 2 persone, a nome Cliente Test?" }] }], { input_tokens: 0, output_tokens: 0 }));
    await service.handle(id, { type: "input_audio_buffer.speech_started", item_id: "yes" });
    await service.handle(id, { type: "conversation.item.input_audio_transcription.completed", item_id: "yes", transcript: "Sì", usage: { type: "tokens", input_tokens: 1, output_tokens: 1 } });
    expect(new Reservations(join(directory, "bookings.json")).read()).toEqual([]);
    if (acknowledged) await service.acknowledgePlayback(id, { type: "playback_finished", response_id: "summary" });
    await vi.advanceTimersByTimeAsync(2001);
    expect(new Reservations(join(directory, "bookings.json")).read()).toHaveLength(acknowledged ? 1 : 0);
    const log = readFileSync(join(directory, "voice-events.jsonl"), "utf8");
    expect(log).toContain(acknowledged ? "RESERVATION_SAVED" : "CONFIRMATION_REQUIRED");
  });
});
