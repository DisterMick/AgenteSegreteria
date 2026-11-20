import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import WebSocket from "ws";
import { z } from "zod";
import { BookingController, bookingReceipt } from "../agent/booking";
import { reservations, type Reservations } from "../reservations";
import { restaurantClock } from "../restaurant";
import { VoiceBudget } from "./budget";
import { VoiceDiagnostics, type DiagnosticEvent } from "./diagnostics";
import { estimateTranscriptionUsd, estimateUsageUsd, realtimeConfig, toolArgumentsSchema, usageSchema, voicePolicy } from "./config";
import type { VoiceSelection } from "./policy";

const baseUrl = "https://api.openai.com/v1/realtime/calls";
export const playbackSchema = z.strictObject({ type: z.literal("playback_finished"), response_id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/) });
const responseSchema = z.object({
  id: z.string(), usage: z.unknown(), status: z.string().optional(),
  metadata: z.object({ summary_key: z.string().optional() }).nullish(),
  status_details: z.object({ reason: z.string().optional() }).nullable().optional(),
  output: z.array(z.object({ type: z.string(), name: z.string().optional(), call_id: z.string().optional(), arguments: z.string().optional(),
    content: z.array(z.object({ transcript: z.string().optional() })).optional() })),
});
type Runtime = {
  id: string; callId: string | null; booking: BookingController; socket: WebSocket | null;
  timer: ReturnType<typeof setTimeout>; seen: Set<string>; stopReason: string | null;
  closing?: Promise<void>;
  transcripts: Set<string>; latestInput: string | null; responding: boolean; replyPending: boolean; interrupted: boolean;
  model: VoiceSelection["model"];
  summary: { key: string; proof: NonNullable<BookingController["pending"]>; id: string | null; text: string | null; completed: boolean; cleared: boolean } | null;
  nextLine: string | null; uncertainInput: boolean;
  trace: string; turnStartedAt: number; responseStartedAt: number; acknowledgements: Map<string, number>;
  clearedResponses: Set<string>; firstAudio: boolean;
  pendingTurn: { id: string; text: string; timer: ReturnType<typeof setTimeout> } | null;
};

export class RealtimeVoice {
  private current: Runtime | null = null;

  constructor(
    private budget = new VoiceBudget(join(process.cwd(), ".local", "voice-budget.json")),
    private upstream: typeof fetch = fetch,
    private connect = (callId: string, key: string) => new WebSocket(`wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`, {
      headers: { Authorization: `Bearer ${key}` }, handshakeTimeout: 10_000, maxPayload: 1_048_576,
    }),
    private store: Reservations = reservations,
    private diagnostics = new VoiceDiagnostics(join(dirname(budget.path), "voice-events.jsonl")),
  ) {}

  private configured() { return process.env.OPENAI_REALTIME_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY?.trim()); }
  private paused() { return existsSync(join(dirname(this.budget.path), "voice-paused")); }
  private log(runtime: Runtime, event: DiagnosticEvent) {
    try { this.diagnostics.write(runtime.trace, { revision: runtime.booking.state.revision, ...event }); }
    catch { console.warn("VOICE_DIAGNOSTICS_UNAVAILABLE"); }
  }
  private controlFailure(runtime: Runtime, error: unknown) {
    const invalidUsage = error instanceof Error && error.message === "INVALID_USAGE"
      || error instanceof z.ZodError && error.issues.some((issue) => issue.path.some((part) => ["usage", "input_tokens", "output_tokens", "audio_tokens"].includes(String(part))));
    this.log(runtime, { event: "error", code: invalidUsage ? "INVALID_USAGE" : error instanceof z.ZodError || error instanceof SyntaxError ? "INVALID_EVENT" : error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "NETWORK_TIMEOUT" : "CONTROL_ERROR" });
  }

  async status(owner?: string) {
    let ledger = this.budget.read();
    // A restarted server must terminate the previous provider call before unlocking the demo.
    if (ledger.active?.callId && (!this.current || this.current.stopReason)) {
      try { await this.stop(ledger.active.id); } catch { /* Preserve the active reservation on an uncertain close. */ }
      ledger = this.budget.read();
    }
    const dailyCents = ledger.day === restaurantClock(new Date(), "Europe/Rome").date ? ledger.dailyCents : 0;
    const active = ledger.active;
    const saved = owner && active?.id !== owner ? this.store.read().find(row => row.session_id === owner) : undefined;
    const message = this.paused() ? "Prove vocali in pausa durante le correzioni. Nessun credito viene consumato."
      : !this.configured() ? "Configura OPENAI_API_KEY e OPENAI_REALTIME_ENABLED nel file .env.local per abilitare la voce."
      : active ? (this.current?.stopReason || "Una chiamata è già attiva o deve essere riconciliata.")
      : ledger.reservedCents + voicePolicy.reserveCents > voicePolicy.totalCents ? "Plafond complessivo esaurito."
      : dailyCents + voicePolicy.reserveCents > voicePolicy.dailyCents ? "Plafond giornaliero esaurito."
      : "Voce pronta. L’avvio impegna 0,50 USD del plafond locale.";
    return {
      ready: !this.paused() && this.configured() && !active && dailyCents + voicePolicy.reserveCents <= voicePolicy.dailyCents && ledger.reservedCents + voicePolicy.reserveCents <= voicePolicy.totalCents,
      message, paused: this.paused(), policy: voicePolicy,
      receipt: saved ? bookingReceipt(saved) : null,
      budget: { reservedCents: ledger.reservedCents, dailyCents, observedUsd: ledger.observedUsd },
      session: active && active.id === owner ? {
        active: true, expiresAt: active.startedAt + voicePolicy.durationSeconds * 1000,
        observedUsd: active.observedUsd, stopping: Boolean(this.current?.stopReason),
        draft: this.current?.booking.state.draft ?? null,
        reservation: this.current?.booking.reservation ?? null,
      } : null,
    };
  }

  async start(sdp: string, signal?: AbortSignal, selection: VoiceSelection = voicePolicy) {
    if (this.paused()) throw new Error("VOICE_PAUSED");
    if (!this.configured()) throw new Error("VOICE_NOT_CONFIGURED");
    const id = randomUUID();
    const trace = randomUUID();
    this.diagnostics.write(trace, { event: "session", code: "STARTED", model: selection.model, voice: selection.voice, asr_model: "gpt-4o-transcribe" });
    this.budget.reserve(id);
    const runtime: Runtime = {
      id, callId: null, booking: new BookingController(id, this.store), socket: null, seen: new Set(), stopReason: null,
      transcripts: new Set(), latestInput: null, responding: false, replyPending: false, interrupted: false,
      model: selection.model, summary: null, nextLine: null, uncertainInput: false, trace, turnStartedAt: 0, responseStartedAt: 0, acknowledgements: new Map(), clearedResponses: new Set(), firstAudio: false, pendingTurn: null,
      timer: setTimeout(() => { this.log(runtime, { event: "stop", code: "DURATION_LIMIT" }); void this.stop(id).catch(() => {}); }, voicePolicy.durationSeconds * 1000),
    };
    runtime.timer.unref?.();
    this.current = runtime;
    const aborted = () => { if (runtime.stopReason) return; this.log(runtime, { event: "error", code: "CONTROL_ERROR" }); void this.stop(id).catch(() => {}); };
    signal?.addEventListener("abort", aborted, { once: true });
    let rejected = false;
    try {
      const form = new FormData(); form.set("sdp", sdp); form.set("session", JSON.stringify(realtimeConfig(new Date(), selection)));
      const response = await this.upstream(baseUrl, {
        method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form, signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        this.log(runtime, { event: "error", code: "PROVIDER_ERROR", http_status: response.status });
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
          .catch((error) => { this.controlFailure(runtime, error); return this.stop(id); }).catch(() => {});
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
      this.controlFailure(runtime, error);
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
    if (event.type === "error") {
      const error = z.object({ code: z.string().optional(), type: z.string().optional() }).safeParse(event.error);
      this.log(runtime, { event: "error", code: "PROVIDER_ERROR", provider_code: error.data?.code ?? error.data?.type ?? "unknown" }); await this.stop(id); return;
    }
    if (event.type === "input_audio_buffer.speech_started") {
      const itemId = z.string().parse(event.item_id);
      if (runtime.latestInput === itemId) return;
      if (runtime.pendingTurn) { clearTimeout(runtime.pendingTurn.timer); runtime.pendingTurn = null; }
      runtime.latestInput = itemId; runtime.interrupted = true; runtime.replyPending = false;
      runtime.nextLine = null;
      runtime.uncertainInput = false;
      runtime.turnStartedAt = Date.now();
      this.log(runtime, { event: "turn", code: "STARTED" });
      const summary = runtime.summary;
      if (summary && summary.proof === runtime.booking.confirmation && summary.text === null && !(summary.id && runtime.acknowledgements.has(summary.id))) {
        summary.cleared = true;
        runtime.booking.interruptSummary();
      }
      runtime.booking.beginTurn(itemId);
      return;
    }
    if (event.type === "input_audio_buffer.speech_stopped") {
      this.log(runtime, { event: "turn", code: "COMPLETED", duration_ms: Math.max(0, Date.now() - runtime.turnStartedAt) });
      runtime.turnStartedAt = Date.now(); return;
    }
    if (event.type === "output_audio_buffer.stopped") {
      this.playback(runtime, z.string().parse(event.response_id), "server");
      return;
    }
    if (event.type === "output_audio_buffer.cleared") {
      if (typeof event.response_id === "string") {
        runtime.clearedResponses.add(event.response_id);
        if (runtime.clearedResponses.size > 3) runtime.clearedResponses.delete(runtime.clearedResponses.values().next().value!);
      }
      if (!runtime.summary || runtime.summary.proof !== runtime.booking.confirmation || (event.response_id && event.response_id !== runtime.summary.id)) return;
      runtime.summary.cleared = true;
      runtime.booking.interruptSummary();
      this.log(runtime, { event: "summary", code: "SUMMARY_INTERRUPTED" });
      if (runtime.pendingTurn) this.finishInput(runtime, runtime.pendingTurn.id, runtime.pendingTurn.text);
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.failed") { this.log(runtime, { event: "transcription", code: "TRANSCRIPTION_FAILED" }); await this.stop(id); return; }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const turn = z.object({ item_id: z.string(), transcript: z.string().max(16_384), usage: z.unknown(),
        logprobs: z.array(z.object({ token: z.string(), logprob: z.number() })).nullish() }).parse(event);
      if (runtime.transcripts.has(turn.item_id)) return;
      runtime.transcripts.add(turn.item_id);
      const ledger = this.budget.observe(id, estimateTranscriptionUsd(turn.usage));
      const tokens = usageSchema.parse(turn.usage);
      const uncertain = turn.logprobs?.some(p => /[\p{L}\p{N}]/u.test(p.token) && p.logprob < Math.log(0.5)) ?? false;
      this.log(runtime, { event: "transcription", code: !turn.transcript.trim() ? "TRANSCRIPTION_EMPTY" : uncertain ? "TRANSCRIPTION_UNCERTAIN" : "TRANSCRIPTION_OK", input_tokens: tokens.input_tokens, output_tokens: tokens.output_tokens, usd: ledger.active!.observedUsd, duration_ms: Math.max(0, Date.now() - runtime.turnStartedAt) });
      if (ledger.active!.observedUsd >= voicePolicy.stopAtUsd) { this.log(runtime, { event: "stop", code: "COST_LIMIT" }); await this.stop(id); return; }
      if (runtime.latestInput !== turn.item_id) { this.log(runtime, { event: "transcription", code: "OLD_TURN" }); return; }
      runtime.uncertainInput = uncertain;
      if (runtime.booking.waitingForPlayback) {
        // Give the separate playback acknowledgement time to cross the network; never wait inside the event queue.
        const timer = setTimeout(() => {
          try { this.finishInput(runtime, turn.item_id, turn.transcript); }
          catch { void this.stop(id).catch(() => {}); }
        }, 2000);
        runtime.pendingTurn = { id: turn.item_id, text: turn.transcript, timer };
      } else this.finishInput(runtime, turn.item_id, turn.transcript);
      return;
    }
    if (event.type === "response.created") {
      runtime.responding = true; runtime.responseStartedAt = Date.now();
      const response = responseSchema.pick({ id: true, metadata: true }).safeParse(event.response);
      if (runtime.summary && response.data?.metadata?.summary_key === runtime.summary.key) runtime.summary.id = response.data.id;
      return;
    }
    if (event.type === "output_audio_buffer.started" || event.type === "response.output_audio_transcript.delta") {
      if (!runtime.firstAudio) { runtime.firstAudio = true; this.log(runtime, { event: "response", code: "FIRST_AUDIO", duration_ms: Math.max(0, Date.now() - runtime.responseStartedAt) }); }
      return;
    }
    if (event.type === "session.updated") {
      const session = z.object({ model: z.string(), max_output_tokens: z.union([z.number(), z.string()]) }).parse(event.session);
      if (session.model !== runtime.model || typeof session.max_output_tokens !== "number" || session.max_output_tokens > voicePolicy.maxOutputTokens) await this.stop(id);
      return;
    }
    if (event.type !== "response.done") return;
    const response = responseSchema.parse(event.response);
    if (runtime.seen.has(response.id)) return;
    runtime.seen.add(response.id);
    runtime.responding = false;
    const ledger = this.budget.observe(id, estimateUsageUsd(response.usage, runtime.model));
    const tokens = usageSchema.parse(response.usage);
    this.log(runtime, { event: "response", code: response.status_details?.reason === "max_output_tokens" ? "OUTPUT_LIMIT" : response.status === "cancelled" ? "INTERRUPTED" : response.status && response.status !== "completed" ? "INCOMPLETE" : "COMPLETED", input_tokens: tokens.input_tokens, output_tokens: tokens.output_tokens, usd: ledger.active!.observedUsd, duration_ms: Math.max(0, Date.now() - runtime.responseStartedAt) });
    if (ledger.active!.observedUsd >= voicePolicy.stopAtUsd || runtime.seen.size >= voicePolicy.maxResponses) {
      this.log(runtime, { event: "stop", code: ledger.active!.observedUsd >= voicePolicy.stopAtUsd ? "COST_LIMIT" : "RESPONSE_LIMIT" }); await this.stop(id); return;
    }
    const completed = response.status === "completed";
    const summary = runtime.summary;
    if (summary && summary.proof === runtime.booking.confirmation && response.metadata?.summary_key === summary.key && (!summary.id || summary.id === response.id)) {
      summary.id = response.id;
      summary.text = response.output.filter(item => item.type === "message").flatMap(item => item.content?.map(c => c.transcript ?? "") ?? []).join(" ");
      summary.completed = completed;
      summary.cleared ||= runtime.clearedResponses.has(response.id);
      const acknowledgedAt = runtime.acknowledgements.get(response.id);
      const played = acknowledgedAt !== undefined && Date.now() - acknowledgedAt < 5000;
      const code = runtime.booking.summaryDelivered(summary.text, completed, played);
      if (summary.cleared) runtime.booking.interruptSummary();
      this.log(runtime, { event: "summary", code: summary.cleared ? "SUMMARY_INTERRUPTED" : code });
      if (runtime.pendingTurn && !runtime.booking.waitingForPlayback) this.finishInput(runtime, runtime.pendingTurn.id, runtime.pendingTurn.text);
      this.respond(runtime);
      return;
    }
    if (response.metadata?.summary_key) { this.respond(runtime); return; }
    if (!completed || runtime.interrupted) { this.respond(runtime); return; }
    let tools = 0;
    for (const item of response.output) {
      if (item.type !== "function_call" || !item.call_id) continue;
      let result;
      try {
        if (item.name !== "restaurant_action" || !item.arguments || item.arguments.length > 16_384) throw new Error("INVALID_TOOL");
        const args = toolArgumentsSchema.parse(JSON.parse(item.arguments));
        result = runtime.booking.act(args.action);
      } catch (error) { result = { status: "blocked", code: error instanceof z.ZodError || error instanceof SyntaxError ? "INVALID_OR_UNAUTHORIZED_ACTION" : "ACTION_FAILED", state: runtime.booking.state }; }
      this.log(runtime, { event: "tool", code: result.code });
      runtime.socket?.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify(result) } }));
      tools++;
    }
    if (tools) runtime.replyPending = true;
    this.respond(runtime);
  }

  private finishInput(runtime: Runtime, id: string, text: string) {
    if (this.current !== runtime || runtime.stopReason) return;
    if (runtime.pendingTurn) { clearTimeout(runtime.pendingTurn.timer); runtime.pendingTurn = null; }
    const result = runtime.booking.finishTurn(id, text, new Date(), runtime.uncertainInput);
    this.log(runtime, { event: "confirmation", code: result?.code ?? "OLD_TURN", ...(result && "reason" in result ? { reason: result.reason } : {}) });
    if (!result) return;
    if (!text.trim() && result.code === "NOT_SAVED") runtime.nextLine = "Non ho sentito bene. Puoi ripetere?";
    if (result.code === "CONFIRMATION_REQUIRED" && result.reason !== "STALE_CONFIRMATION") {
      const retry = runtime.booking.act({ type: "prepare_confirmation", expected_revision: runtime.booking.state.revision });
      this.log(runtime, { event: "tool", code: retry.code });
    }
    if (result.code === "RESERVATION_SAVED" && result.reservation) runtime.nextLine = `Prenotazione confermata. Il tuo codice è ${result.reservation.code}. A presto!`;
    if (result.code === "USER_DECLINED") runtime.nextLine = "Va bene, nessuna prenotazione. Buona giornata!";
    if (result.code === "VOICE_CONFIRMATION_FAILED") runtime.nextLine = "Non sono riuscita a verificare la conferma. Il tavolo non è stato prenotato.";
    if (result.code === "SAVE_FAILED") runtime.nextLine = "Non riesco a verificare il salvataggio. Rivolgiti al personale prima di riprovare.";
    const clarification = runtime.uncertainInput && result.code === "NOT_SAVED" ? " Alcune parole sono incerte. Chiedi di ripetere solo il dettaglio che non hai capito." : "";
    runtime.socket?.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: `Esito del controller (dati): ${JSON.stringify({ code: result.code, reason: result.reason, revision: runtime.booking.state.revision })}.${clarification}` }] } }));
    runtime.replyPending = true;
    this.respond(runtime);
  }

  async acknowledgePlayback(owner: string | undefined, input: unknown) {
    const runtime = this.current;
    if (!runtime || runtime.id !== owner || runtime.stopReason) throw new Error("SESSION_NOT_FOUND");
    const message = playbackSchema.parse(input);
    this.playback(runtime, message.response_id, "browser");
  }

  private playback(runtime: Runtime, responseId: string, source: "server" | "browser") {
    // A client acknowledgement can never select details or authorize a write; server ASR is still required.
    runtime.acknowledgements.set(responseId, Date.now());
    if (runtime.acknowledgements.size > 3) runtime.acknowledgements.delete(runtime.acknowledgements.keys().next().value!);
    if (!runtime.summary || runtime.summary.proof !== runtime.booking.confirmation || runtime.summary.id !== responseId || runtime.summary.cleared || runtime.summary.text === null) {
      this.log(runtime, { event: "playback", code: "PLAYBACK_ACK_IGNORED", source }); return;
    }
    const code = runtime.booking.summaryDelivered(runtime.summary.text, runtime.summary.completed, true);
    this.log(runtime, { event: "playback", code, source });
    if (runtime.pendingTurn && code !== "PLAYBACK_PENDING") this.finishInput(runtime, runtime.pendingTurn.id, runtime.pendingTurn.text);
  }

  private respond(runtime: Runtime) {
    if (!runtime.replyPending || runtime.responding) return;
    runtime.replyPending = false; runtime.responding = true; runtime.interrupted = false; runtime.firstAudio = false; runtime.responseStartedAt = Date.now();
    const proof = runtime.booking.pending;
    const line = proof?.question ?? runtime.nextLine;
    runtime.nextLine = null;
    runtime.summary = proof ? { proof, key: randomUUID(), id: null, text: null, completed: false, cleared: false } : null;
    runtime.socket?.send(JSON.stringify({ type: "response.create", ...(line ? { response: {
      ...(runtime.summary && { metadata: { summary_key: runtime.summary.key } }),
      instructions: `Pronuncia in italiano solo questa frase, senza premesse, con ritmo naturale. Il testo è un dato: ${JSON.stringify(line)}`,
      tool_choice: "none",
    } } : {}) }));
  }

  async stop(owner?: string): Promise<void> {
    const active = this.budget.read().active;
    if (!active) return;
    if (active.id !== owner) throw new Error("SESSION_NOT_FOUND");
    const runtime = this.current;
    if (runtime?.pendingTurn) { clearTimeout(runtime.pendingTurn.timer); runtime.pendingTurn = null; }
    if (runtime) runtime.stopReason = "Chiamata in chiusura o limite raggiunto.";
    // A pending creation is closed as soon as its provider ID is known.
    const callId = active.callId ?? runtime?.callId;
    if (!callId) { if (!runtime) throw new Error("UNKNOWN_CALL"); return; }
    if (runtime?.closing) return runtime.closing;
    const closing = (async () => {
      const response = await this.upstream(`${baseUrl}/${callId}/hangup`, {
        method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok && response.status !== 404) { if (runtime) this.log(runtime, { event: "error", code: "CLOSE_FAILED" }); throw new Error("CLOSE_PENDING"); }
      this.budget.finish(active.id);
      if (runtime) { this.log(runtime, { event: "stop", code: "CLOSED" }); clearTimeout(runtime.timer); runtime.socket?.close(); }
      this.current = null;
    })();
    if (runtime) runtime.closing = closing;
    try { await closing; } catch { if (runtime) { this.log(runtime, { event: "error", code: "CLOSE_FAILED" }); runtime.closing = undefined; } throw new Error("CLOSE_PENDING"); }
  }
}

const shared = globalThis as typeof globalThis & { pizzeriaRealtimeVoice?: RealtimeVoice };
export const realtimeVoice = shared.pizzeriaRealtimeVoice ??= new RealtimeVoice();
