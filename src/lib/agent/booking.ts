import { actionSchema, createAgentSessionState, processAgentProposal, type BookingDraft } from "./harness";
import type { Reservations, Reservation } from "../reservations";

const normalized = (text: string) => text.toLocaleLowerCase("it").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
const summaryKey = (text: string) => text.toLocaleLowerCase("it").normalize("NFD").replace(/\p{M}/gu, "")
  .replace(/(?<=\d)[/.:](?=\d)/g, "/").replace(/[^\p{L}\p{N}/]+/gu, " ").trim();
type Confirmation = { revision: number; expires: number; question: string; variants: Set<string>; ready: boolean; reason: string; interrupted: boolean };
const affirmative = new Set([
  "si", "si si", "confermo", "si confermo", "si si confermo", "si grazie confermo",
  "si ti confermo", "confermo la prenotazione", "si confermo la prenotazione",
  "confermo tutto", "si confermo tutto", "va bene", "si va bene", "si va benissimo",
  "esatto", "si esatto", "si certo", "si perfetto", "si e corretto", "si e giusto",
]);
const negative = new Set(["no", "nograzie", "nonconfermo", "annulla", "lasciastare", "noannulla", "nolasciastare", "nonvoglioprenotare"]);
function explicitAssent(transcript: string) {
  if (transcript.includes("?")) return false;
  const words = summaryKey(transcript);
  return affirmative.has(words.replace(/ grazie(?: mille)?$/, ""));
}
const smallNumbers = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci", "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove"];
function spokenNumber(value: number): string {
  if (value < 20) return smallNumbers[value];
  if (value >= 100) return value >= 2000 && value < 2100 ? `duemila${value === 2000 ? "" : spokenNumber(value - 2000)}` : String(value);
  const tens = ["", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"][Math.floor(value / 10)];
  const unit = value % 10;
  return `${unit === 1 || unit === 8 ? tens.slice(0, -1) : tens}${unit ? smallNumbers[unit] : ""}`;
}

function summaryQuestions(draft: BookingDraft) {
  const [year, month, day] = draft.date!.split("-").map(Number);
  const monthName = new Intl.DateTimeFormat("it-IT", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
  const [hour, minutes] = draft.time!.split(":").map(Number);
  const spokenTime = minutes ? `${spokenNumber(hour)} e ${spokenNumber(minutes)}` : spokenNumber(hour);
  const times = minutes ? [draft.time!, spokenTime] : [draft.time!, String(hour), spokenTime];
  const party = draft.party_size === 1 ? "una persona" : `${spokenNumber(draft.party_size!)} persone`;
  const article = [8, 11].includes(day) ? "l’" : "il ";
  const spokenDay = day === 1 ? "primo" : String(day);
  const variants = new Set<string>();
  for (const date of [`${day}/${month}/${year}`, `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
    ...[String(day), spokenDay, spokenNumber(day)].flatMap((d) => [String(year), spokenNumber(year)].map((y) => `${d} ${monthName} ${y}`))]) {
    for (const time of times) {
      for (const people of [party, `${draft.party_size} ${draft.party_size === 1 ? "persona" : "persone"}`]) {
        for (const prefix of new Set([article, "il "])) {
          variants.add(summaryKey(`Confermi la prenotazione per ${prefix}${date} alle ${time}, per ${people}, a nome ${draft.name}?`));
        }
      }
    }
  }
  return { question: `Confermi la prenotazione per ${article}${spokenDay} ${monthName} ${year} alle ${spokenTime}, per ${party}, a nome ${draft.name}?`, variants };
}

export function bookingReceipt(saved: Reservation) {
  return { id: saved.id, code: saved.id.slice(0, 8).toUpperCase(), date: saved.date, time: saved.time, party_size: saved.party_size, name: saved.name, table_id: saved.table_id };
}

export class BookingController {
  state = createAgentSessionState();
  reservation: ReturnType<typeof bookingReceipt> | null = null;
  pending: Confirmation | null = null;
  private turn: { id: string; confirmation: Confirmation | null } | null = null;
  private failures = 0;
  private correctionRevision: number | null = null;

  constructor(private sessionId: string, private store: Pick<Reservations, "read" | "save">) {}

  get confirmation() { return this.pending ?? this.turn?.confirmation; }

  get waitingForPlayback() {
    const reason = this.turn?.confirmation?.reason;
    return reason === "SUMMARY_PENDING" || reason === "PLAYBACK_PENDING";
  }

  act(input: unknown, now = new Date()) {
    if (this.reservation) {
      const proposal = actionSchema.safeParse(input);
      if (proposal.success && ["prepare_confirmation", "update_draft", "check_availability"].includes(proposal.data.type)) {
        return { status: "blocked" as const, code: "RESERVATION_ALREADY_SAVED", state: this.state };
      }
    }
    const previous = this.state.revision;
    const result = processAgentProposal(this.state, input, now, () => this.store.read());
    this.state = result.state;
    if (this.state.revision !== previous || result.code === "INVALID_AVAILABILITY" || result.code === "NO_AVAILABILITY") {
      this.pending = null;
      if (this.turn?.confirmation) { this.turn.confirmation.ready = false; this.turn.confirmation.reason = "STALE_CONFIRMATION"; }
      if (this.state.revision !== previous) this.failures = 0;
    }
    if (result.code === "AWAITING_USER_CONFIRMATION") {
      if (this.correctionRevision === this.state.revision) {
        this.state = { ...this.state, awaiting_confirmation_revision: null };
        return { status: "blocked" as const, code: "DETAILS_CHANGE_REQUESTED", state: this.state };
      }
      if (this.failures >= 2) {
        this.pending = null;
        this.state = { ...this.state, awaiting_confirmation_revision: null };
        return { status: "blocked" as const, code: "VOICE_CONFIRMATION_FAILED", state: this.state };
      }
      const draft = this.state.draft;
      const { question, variants } = summaryQuestions(draft);
      this.pending = { revision: this.state.revision, expires: now.getTime() + 120_000, question, variants, ready: false, reason: "SUMMARY_PENDING", interrupted: false };
      result.data = { ...result.data, question };
    }
    return result;
  }

  summaryDelivered(transcript: string, completed: boolean, played = true) {
    const confirmation = this.confirmation;
    if (!confirmation || confirmation.interrupted) return "NO_SUMMARY";
    confirmation.reason = !completed ? "SUMMARY_INCOMPLETE" : !confirmation.variants.has(summaryKey(transcript)) ? "SUMMARY_MISMATCH" : !played ? "PLAYBACK_PENDING" : "SUMMARY_READY";
    confirmation.ready = confirmation.reason === "SUMMARY_READY";
    return confirmation.reason;
  }

  interruptSummary() {
    const confirmation = this.confirmation;
    if (confirmation) { confirmation.interrupted = true; confirmation.ready = false; confirmation.reason = "SUMMARY_INTERRUPTED"; }
  }

  beginTurn(id: string) {
    // Only a new audio turn after the complete summary can confirm it.
    if (this.turn?.id === id) return;
    this.turn = { id, confirmation: this.pending };
    this.pending = null;
  }

  finishTurn(id: string, transcript: string, now = new Date(), uncertain = false) {
    if (this.turn?.id !== id) return null;
    const confirmation = this.turn.confirmation;
    this.turn = null;
    if (!confirmation) return this.reservation ? { code: "RESERVATION_ALREADY_SAVED", reservation: this.reservation } : { code: "NOT_SAVED", reason: "NO_SUMMARY" };
    const words = transcript.toLocaleLowerCase("it").normalize("NFD").replace(/\p{M}/gu, "");
    if (negative.has(normalized(transcript))) {
      this.state = { ...createAgentSessionState(), revision: this.state.revision + 1 };
      this.failures = 0;
      return { code: "USER_DECLINED", reason: "NEGATIVE_REPLY" };
    }
    this.state = { ...this.state, awaiting_confirmation_revision: null };
    if (/^no\b/.test(words.trim()) || /\b(ma|invece|anzi|aspetta|preferisco|cambia|cambiamo|siamo in|a nome|mi chiamo|il cognome|il nome|si scrive|alle|domani)\b/.test(words)) {
      this.correctionRevision = this.state.revision;
      return { code: "DETAILS_CHANGE_REQUESTED", reason: "DETAILS_CHANGED" };
    }
    const reason = confirmation.revision !== this.state.revision ? "STALE_CONFIRMATION"
      : confirmation.expires < now.getTime() ? "EXPIRED_CONFIRMATION"
      : !confirmation.ready ? confirmation.reason
      : uncertain ? "TRANSCRIPTION_UNCERTAIN"
      : !explicitAssent(transcript) ? "AMBIGUOUS_REPLY" : null;
    if (reason) {
      this.failures++;
      return { code: this.failures >= 2 ? "VOICE_CONFIRMATION_FAILED" : "CONFIRMATION_REQUIRED", reason };
    }
    this.state = { ...this.state, availability_revision: null };
    let saved: Reservation | undefined;
    try {
      saved = this.store.save(this.sessionId, confirmation.revision, this.state.draft, now);
    } catch (error) {
      if (error instanceof Error && error.message === "NO_AVAILABILITY") return { code: "NO_AVAILABILITY" };
      // A lock cleanup can fail after the atomic rename has already committed.
      try {
        const draft = this.state.draft;
        saved = this.store.read().find(row => row.session_id === this.sessionId && row.revision === confirmation.revision
          && row.date === draft.date && row.time === draft.time && row.party_size === draft.party_size && row.name === draft.name);
      } catch { /* The receipt must remain unconfirmed when the archive cannot be read. */ }
      if (!saved) return { code: "SAVE_FAILED" };
    }
    this.reservation = bookingReceipt(saved);
    return { code: "RESERVATION_SAVED", reservation: this.reservation };
  }
}
