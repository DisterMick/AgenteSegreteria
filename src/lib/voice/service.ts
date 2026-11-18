import { randomUUID } from "node:crypto";
import { join } from "node:path";
import WebSocket from "ws";
import { z } from "zod";
import { createAgentSessionState, processAgentProposal, type AgentSessionState } from "../agent/harness";
import { restaurantClock } from "../restaurant";
import { VoiceBudget } from "./budget";
import { estimateUsageUsd, realtimeConfig, toolArgumentsSchema, voicePolicy } from "./config";

const baseUrl = "https://api.openai.com/v1/realtime/calls";
const responseSchema = z.object({
  id: z.string(), usage: z.unknown(), status: z.string().optional(),
  output: z.array(z.object({ type: z.string(), name: z.string().optional(), call_id: z.string().optional(), arguments: z.string().optional() })),
});
type Runtime = {
  id: string; callId: string | null; state: AgentSessionState; socket: WebSocket | null;
  timer: ReturnType<typeof setTimeout>; seen: Set<string>; stopReason: string | null;
  closing?: Promise<void>;
};

export class RealtimeVoice {
  private current: Runtime | null = null;

  constructor(
    private budget = new VoiceBudget(join(process.cwd(), ".local", "voice-budget.json")),
    private upstream: typeof fetch = fetch,
    private connect = (callId: string, key: string) => new WebSocket(`wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`, {
      headers: { Authorization: `Bearer ${key}` }, handshakeTimeout: 10_000, maxPayload: 1_048_576,
    }),
  ) {}

  private configured() { return process.env.OPENAI_REALTIME_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY?.trim()); }

  async status(owner?: string) {
    let ledger = this.budget.read();
    // A restarted server must terminate the previous provider call before unlocking the demo.
    if (ledger.active?.callId && (!this.current || this.current.stopReason)) {
      try { await this.stop(ledger.active.id); } catch { /* Preserve the active reservation on an uncertain close. */ }
      ledger = this.budget.read();
    }
    const dailyCents = ledger.day === restaurantClock().date ? ledger.dailyCents : 0;
    const active = ledger.active;
    const message = !this.configured() ? "Configura OPENAI_API_KEY e OPENAI_REALTIME_ENABLED nel file .env.local per abilitare la voce."
      : active ? (this.current?.stopReason || "Una chiamata è già attiva o deve essere riconciliata.")
      : ledger.reservedCents + voicePolicy.reserveCents > voicePolicy.totalCents ? "Plafond complessivo esaurito."
      : dailyCents + voicePolicy.reserveCents > voicePolicy.dailyCents ? "Plafond giornaliero esaurito."
      : "Voce pronta. L’avvio impegna 0,50 USD del plafond locale.";
    return {
      ready: this.configured() && !active && dailyCents + voicePolicy.reserveCents <= voicePolicy.dailyCents && ledger.reservedCents + voicePolicy.reserveCents <= voicePolicy.totalCents,
      message, policy: voicePolicy,
      budget: { reservedCents: ledger.reservedCents, dailyCents, observedUsd: ledger.observedUsd },
      session: active && active.id === owner ? {
        active: true, expiresAt: active.startedAt + voicePolicy.durationSeconds * 1000,
        observedUsd: active.observedUsd, stopping: Boolean(this.current?.stopReason),
        draft: this.current?.state.draft ?? null,
      } : null,
    };
  }

  async start(sdp: string, signal?: AbortSignal) {
    if (!this.configured()) throw new Error("VOICE_NOT_CONFIGURED");
    const id = randomUUID();
    this.budget.reserve(id);
    const runtime: Runtime = {
      id, callId: null, state: createAgentSessionState(), socket: null, seen: new Set(), stopReason: null,
      timer: setTimeout(() => { void this.stop(id).catch(() => {}); }, voicePolicy.durationSeconds * 1000),
    };
    runtime.timer.unref?.();
    this.current = runtime;
    const aborted = () => { void this.stop(id).catch(() => {}); };
    signal?.addEventListener("abort", aborted, { once: true });
    let rejected = false;
    try {
      const form = new FormData(); form.set("sdp", sdp); form.set("session", JSON.stringify(realtimeConfig()));
      const response = await this.upstream(baseUrl, {
        method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form, signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        rejected = true;
        throw new Error([401, 403].includes(response.status) ? "OPENAI_ACCESS_DENIED" : response.status === 429 ? "OPENAI_QUOTA_OR_RATE_LIMIT" : "OPENAI_CONNECTION_FAILED");
      }
      const location = response.headers.get("Location");
      const callId = location?.split("/").pop();
      if (!callId || !/^rtc_[a-zA-Z0-9_-]+$/.test(callId)) throw new Error("UNKNOWN_CALL");
      runtime.callId = callId;
      this.budget.attach(id, callId);
      if (signal?.aborted || runtime.stopReason) throw new Error("CALL_ABORTED");
      const socket = this.connect(callId, process.env.OPENAI_API_KEY!);
      runtime.socket = socket;
      let events = Promise.resolve();
      socket.on("message", (raw) => {
        events = events.then(() => this.handle(id, JSON.parse(raw.toString())))
          .catch(() => this.stop(id)).catch(() => {});
      });
      socket.on("error", aborted);
      socket.on("close", aborted);
      await new Promise<void>((resolve, reject) => {
        socket.once("open", resolve); socket.once("error", reject);
        socket.once("close", () => reject(new Error("CONTROL_CHANNEL_CLOSED")));
      });
      if (signal?.aborted || runtime.stopReason) throw new Error("CALL_ABORTED");
      return { id, sdp: await response.text() };
    } catch (error) {
      if (runtime.callId) await this.stop(id).catch(() => {});
      else if (rejected) { clearTimeout(runtime.timer); this.budget.finish(id); this.current = null; }
      else runtime.stopReason = "Esito di connessione incerto: verifica la chiamata su OpenAI prima di riabilitare la demo.";
      throw error;
    } finally {
      signal?.removeEventListener("abort", aborted);
    }
  }

  async handle(id: string, input: unknown) {
    const runtime = this.current;
    if (!runtime || runtime.id !== id || runtime.stopReason) return;
    const event = z.object({ type: z.string() }).passthrough().parse(input);
    if (event.type === "error") { await this.stop(id); return; }
    if (event.type === "session.updated") {
      const session = z.object({ model: z.string(), max_output_tokens: z.union([z.number(), z.string()]) }).parse(event.session);
      if (session.model !== voicePolicy.model || typeof session.max_output_tokens !== "number" || session.max_output_tokens > voicePolicy.maxOutputTokens) await this.stop(id);
      return;
    }
    if (event.type !== "response.done") return;
    const response = responseSchema.parse(event.response);
    if (runtime.seen.has(response.id)) return;
    runtime.seen.add(response.id);
    const ledger = this.budget.observe(id, estimateUsageUsd(response.usage));
    if (ledger.active!.observedUsd >= voicePolicy.stopAtUsd || runtime.seen.size >= voicePolicy.maxResponses) {
      await this.stop(id); return;
    }
    if (response.status && response.status !== "completed") return;
    let tools = 0;
    for (const item of response.output) {
      if (item.type !== "function_call" || !item.call_id) continue;
      let result;
      try {
        if (item.name !== "restaurant_action" || !item.arguments || item.arguments.length > 16_384) throw new Error("INVALID_TOOL");
        const args = toolArgumentsSchema.parse(JSON.parse(item.arguments));
        result = processAgentProposal(runtime.state, args.action);
        runtime.state = result.state;
      } catch { result = { status: "blocked", code: "INVALID_OR_UNAUTHORIZED_ACTION", state: runtime.state }; }
      runtime.socket?.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify(result) } }));
      tools++;
    }
    if (tools) runtime.socket?.send(JSON.stringify({ type: "response.create" }));
  }

  async stop(owner?: string): Promise<void> {
    const active = this.budget.read().active;
    if (!active) return;
    if (active.id !== owner) throw new Error("SESSION_NOT_FOUND");
    const runtime = this.current;
    if (runtime) runtime.stopReason = "Chiamata in chiusura o limite raggiunto.";
    // A pending creation is closed as soon as its provider ID is known.
    const callId = active.callId ?? runtime?.callId;
    if (!callId) { if (!runtime) throw new Error("UNKNOWN_CALL"); return; }
    if (runtime?.closing) return runtime.closing;
    const closing = (async () => {
      const response = await this.upstream(`${baseUrl}/${callId}/hangup`, {
        method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok && response.status !== 404) throw new Error("CLOSE_PENDING");
      this.budget.finish(active.id);
      if (runtime) { clearTimeout(runtime.timer); runtime.socket?.close(); }
      this.current = null;
    })();
    if (runtime) runtime.closing = closing;
    try { await closing; } catch { if (runtime) runtime.closing = undefined; throw new Error("CLOSE_PENDING"); }
  }
}

const shared = globalThis as typeof globalThis & { pizzeriaRealtimeVoice?: RealtimeVoice };
export const realtimeVoice = shared.pizzeriaRealtimeVoice ??= new RealtimeVoice();
