import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

const codes = z.enum(["UNKNOWN", "STARTED", "USER_STOP", "DURATION_LIMIT", "COST_LIMIT", "RESPONSE_LIMIT", "CONTROL_ERROR", "PROVIDER_ERROR", "CLOSE_FAILED", "CLOSED", "TRANSCRIPTION_FAILED", "TRANSCRIPTION_EMPTY", "TRANSCRIPTION_OK", "OLD_TURN", "COMPLETED", "INCOMPLETE", "INTERRUPTED", "NO_SUMMARY", "SUMMARY_INCOMPLETE", "SUMMARY_MISMATCH", "SUMMARY_READY", "PLAYBACK_PENDING", "SUMMARY_INTERRUPTED", "STALE_CONFIRMATION", "EXPIRED_CONFIRMATION", "AMBIGUOUS_REPLY", "NOT_SAVED", "CONFIRMATION_REQUIRED", "VOICE_CONFIRMATION_FAILED", "RESERVATION_SAVED", "SAVE_FAILED", "NO_AVAILABILITY", "INVALID_AVAILABILITY", "INVALID_OR_UNAUTHORIZED_ACTION", "STALE_REQUEST", "UNCHANGED", "DRAFT_UPDATED", "MISSING_BOOKING_DETAILS", "AVAILABILITY_CHECKED", "AVAILABILITY_CHECK_REQUIRED", "AWAITING_USER_CONFIRMATION", "PUBLIC_INFO", "HANDOFF_NOT_IMPLEMENTED", "ACTION_FAILED", "PLAYBACK_ACK_IGNORED", "FIRST_AUDIO", "OUTPUT_LIMIT", "USER_DECLINED", "NEGATIVE_REPLY", "DETAILS_CHANGE_REQUESTED", "DETAILS_CHANGED", "RESERVATION_ALREADY_SAVED", "INVALID_EVENT", "INVALID_USAGE", "NETWORK_TIMEOUT"]);
const eventSchema = z.object({
  event: z.enum(["session", "turn", "transcription", "response", "tool", "summary", "confirmation", "playback", "error", "stop"]),
  code: z.string().transform((value) => codes.safeParse(value).data ?? "UNKNOWN"),
  reason: z.string().transform((value) => codes.safeParse(value).data ?? "UNKNOWN").optional(),
  revision: z.number().int().nonnegative().optional(), duration_ms: z.number().nonnegative().optional(),
  input_tokens: z.number().int().nonnegative().optional(), output_tokens: z.number().int().nonnegative().optional(),
  usd: z.number().nonnegative().optional(), source: z.enum(["server", "browser"]).optional(),
  http_status: z.number().int().min(100).max(599).optional(),
  model: z.literal("gpt-realtime-2.1").optional(), asr_model: z.literal("gpt-4o-transcribe").optional(),
  provider_code: z.string().transform((value) => z.enum(["invalid_api_key", "insufficient_quota", "rate_limit_exceeded", "invalid_request_error", "server_error", "conversation_already_has_active_response", "unsupported_parameter"]).safeParse(value).data ?? "unknown").optional(),
});
export type DiagnosticEvent = z.input<typeof eventSchema>;

export class VoiceDiagnostics {
  constructor(readonly path: string) {}

  write(traceId: string, event: DiagnosticEvent) {
    const row = { at: new Date().toISOString(), trace: z.uuid().parse(traceId), ...eventSchema.parse(event) };
    mkdirSync(dirname(this.path), { recursive: true });
    // Two bounded files suffice for this single-call local lab; no payloads or transcripts.
    if (existsSync(this.path) && statSync(this.path).size >= 262_144) renameSync(this.path, `${this.path}.1`);
    appendFileSync(this.path, `${JSON.stringify(row)}\n`, { mode: 0o600 });
  }
}
