import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceBudget } from "./budget";
import { RealtimeVoice } from "./service";

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
  service = new RealtimeVoice(budget, upstream, () => socket as unknown as WebSocket);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

async function start() {
  const started = service.start("v=0\r\noffer");
  await vi.advanceTimersByTimeAsync(0);
  socket.emit("open");
  return started;
}
const usage = { input_tokens: 1000, output_tokens: 1000 };
const done = (id: string, output: unknown[] = [], tokens = usage) => ({ type: "response.done", response: { id, usage: tokens, output } });

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
  it("usa il vero harness per gli strumenti e deduplica le risposte", async () => {
    const { id } = await start();
    const event = done("one", [{ type: "function_call", name: "restaurant_action", call_id: "call_1", arguments: JSON.stringify({ action: { type: "get_restaurant_info", topic: "menu", expected_revision: 0 } }) }]);
    await service.handle(id, event); await service.handle(id, event);
    expect(socket.sent.filter((item) => item.type === "conversation.item.create")).toHaveLength(1);
    expect(JSON.stringify(socket.sent)).toContain("PUBLIC_INFO");
    expect(budget.read().observedUsd).toBeCloseTo(0.03);
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
    await service.handle(second.id, { type: "session.updated", session: { model: "gpt-realtime-2.1-mini", max_output_tokens: "inf" } });
    expect(budget.read().active).toBeNull();
  });
  it("conteggia una risposta interrotta senza eseguire i suoi strumenti incompleti", async () => {
    const { id } = await start();
    const event = done("interrupted", [{ type: "function_call", name: "restaurant_action", call_id: "call_1", arguments: "{}" }]);
    await service.handle(id, { ...event, response: { ...event.response, status: "cancelled" } });
    expect(socket.sent).toHaveLength(0); expect(budget.read().observedUsd).toBeCloseTo(0.03);
  });
});
