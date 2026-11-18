import { createAgentSessionState, processAgentProposal, type BookingDraft } from "./harness";
import { Reservations, type Reservation } from "../reservations";

const normalized = (text: string) => text.toLocaleLowerCase("it").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
const summaryKey = (text: string) => normalized(text.replace(/(?<=\d)[/.:](?=\d)/g, "separator"));
type Confirmation = { revision: number; expires: number; question: string; variants: Set<string>; ready: boolean; reason: string; interrupted: boolean };
const affirmative = new Set(["si", "siconfermo", "confermo", "sigrazie", "sigrazieconfermo", "vabene", "confermograzie", "sivabene", "siesatto", "esatto", "siticonfermo", "confermolaprenotazione", "siconfermolaprenotazione", "sivabenegrazie"]);
const negative = new Set(["no", "nograzie", "nonconfermo", "annulla", "lasciastare", "noannulla", "nolasciastare", "nonvoglioprenotare"]);
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
  const monthName = new Intl.DateTimeFormat("it-IT", { month: "long", timeZone: "Europe/Rome" }).format(new Date(`${draft.date}T12:00:00Z`));
  const variants = new Set<string>();
  for (const date of [`${day}/${month}/${year}`, `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
    ...[String(day), spokenNumber(day)].flatMap((d) => [String(year), spokenNumber(year)].map((y) => `${d} ${monthName} ${y}`))]) {
    for (const time of [draft.time!, String(Number(draft.time!.slice(0, 2))), spokenNumber(Number(draft.time!.slice(0, 2)))]) {
      for (const party of [String(draft.party_size), spokenNumber(draft.party_size!)]) {
        variants.add(summaryKey(`Confermi la prenotazione per il ${date} alle ${time}, per ${party} ${draft.party_size === 1 ? "persona" : "persone"}, a nome ${draft.name}?`));
      }
    }
  }
  return { question: `Confermi la prenotazione per il ${day} ${monthName} ${year} alle ${spokenNumber(Number(draft.time!.slice(0, 2)))}, per ${spokenNumber(draft.party_size!)} ${draft.party_size === 1 ? "persona" : "persone"}, a nome ${draft.name}?`, variants };
}

export class BookingController {
  state = createAgentSessionState();
  reservation: (Pick<Reservation, "id" | "date" | "time" | "party_size" | "name" | "table_id"> & { code: string }) | null = null;
  pending: Confirmation | null = null;
  private turn: { id: string; confirmation: Confirmation | null } | null = null;
  private failures = 0;

  constructor(private sessionId: string, private store: Reservations) {}

  get waitingForPlayback() { return this.turn?.confirmation?.reason === "PLAYBACK_PENDING"; }

  act(input: unknown, now = new Date()) {
    const previous = this.state.revision;
    const result = processAgentProposal(this.state, input, now, this.store.read());
    this.state = result.state;
    if (this.state.revision !== previous || result.status === "blocked") {
      this.pending = null;
      if (this.turn?.confirmation) { this.turn.confirmation.ready = false; this.turn.confirmation.reason = "STALE_CONFIRMATION"; }
      if (this.state.revision !== previous) this.failures = 0;
    }
    if (result.code === "AWAITING_USER_CONFIRMATION") {
      if (this.failures >= 2) {
        this.pending = null;
        this.state = { ...this.state, awaiting_confirmation_revision: null };
        return { status: "blocked" as const, code: "VOICE_CONFIRMATION_FAILED", state: this.state };
      }
      const draft = this.state.draft;
      const { question, variants } = summaryQuestions(draft);
      this.pending = { revision: this.state.revision, expires: now.getTime() + 120_000, question, variants, ready: false, reason: "SUMMARY_INCOMPLETE", interrupted: false };
      result.data = { ...result.data, question };
    }
    return result;
  }

  summaryDelivered(transcript: string, completed: boolean, played = true) {
    const confirmation = this.pending ?? this.turn?.confirmation;
    if (!confirmation || confirmation.interrupted) return "NO_SUMMARY";
    confirmation.reason = !completed ? "SUMMARY_INCOMPLETE" : !confirmation.variants.has(summaryKey(transcript)) ? "SUMMARY_MISMATCH" : !played ? "PLAYBACK_PENDING" : "SUMMARY_READY";
    confirmation.ready = confirmation.reason === "SUMMARY_READY";
    return confirmation.reason;
  }

  interruptSummary() {
    const confirmation = this.pending ?? this.turn?.confirmation;
    if (confirmation) { confirmation.interrupted = true; confirmation.ready = false; confirmation.reason = "SUMMARY_INTERRUPTED"; }
  }

  beginTurn(id: string) {
    // Only a new audio turn after the complete summary can confirm it.
    if (this.turn?.id === id) return;
    this.turn = { id, confirmation: this.pending };
    this.pending = null;
  }

  finishTurn(id: string, transcript: string, now = new Date()) {
    if (this.turn?.id !== id) return null;
    const confirmation = this.turn.confirmation;
    this.turn = null;
    if (!confirmation) return this.reservation ? { code: "RESERVATION_ALREADY_SAVED", reservation: this.reservation } : { code: "NOT_SAVED", reason: "NO_SUMMARY" };
    const words = transcript.toLocaleLowerCase("it").normalize("NFD").replace(/\p{M}/gu, "");
    if (negative.has(normalized(transcript))) return { code: "USER_DECLINED", reason: "NEGATIVE_REPLY" };
    if (/^no\b/.test(words.trim()) || /\b(ma|invece|anzi|aspetta|preferisco|cambia|cambiamo)\b/.test(words)) return { code: "DETAILS_CHANGE_REQUESTED", reason: "DETAILS_CHANGED" };
    const reason = confirmation.revision !== this.state.revision ? "STALE_CONFIRMATION"
      : confirmation.expires < now.getTime() ? "EXPIRED_CONFIRMATION"
      : !confirmation.ready ? confirmation.reason
      : transcript.includes("?") || !affirmative.has(normalized(transcript)) ? "AMBIGUOUS_REPLY" : null;
    if (reason) {
      this.failures++;
      return { code: this.failures >= 2 ? "VOICE_CONFIRMATION_FAILED" : "CONFIRMATION_REQUIRED", reason };
    }
    try {
      const saved = this.store.save(this.sessionId, confirmation.revision, this.state.draft, now);
      this.reservation = { id: saved.id, code: saved.id.slice(0, 8).toUpperCase(), date: saved.date, time: saved.time, party_size: saved.party_size, name: saved.name, table_id: saved.table_id };
      this.state = { ...this.state, awaiting_confirmation_revision: null, availability_revision: null };
      return { code: "RESERVATION_SAVED", reservation: this.reservation };
    } catch (error) {
      this.state = { ...this.state, awaiting_confirmation_revision: null, availability_revision: null };
      return { code: error instanceof Error && error.message === "NO_AVAILABILITY" ? "NO_AVAILABILITY" : "SAVE_FAILED" };
    }
  }
}
