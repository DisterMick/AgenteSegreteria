import { createAgentSessionState, processAgentProposal } from "./harness";
import { Reservations, type Reservation } from "../reservations";

const normalized = (text: string) => text.toLocaleLowerCase("it").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
type Confirmation = { revision: number; expires: number; question: string; ready: boolean };
const affirmative = new Set(["si", "siconfermo", "confermo", "sigrazie", "sigrazieconfermo", "vabene", "confermograzie", "sivabene"]);

export class BookingController {
  state = createAgentSessionState();
  reservation: (Pick<Reservation, "id" | "date" | "time" | "party_size" | "name" | "table_id"> & { code: string }) | null = null;
  pending: Confirmation | null = null;
  private turn: { id: string; confirmation: Confirmation | null } | null = null;

  constructor(private sessionId: string, private store: Reservations) {}

  act(input: unknown, now = new Date()) {
    const previous = this.state.revision;
    const result = processAgentProposal(this.state, input, now, this.store.read());
    this.state = result.state;
    if (this.state.revision !== previous || result.status === "blocked") this.pending = null;
    if (result.code === "AWAITING_USER_CONFIRMATION") {
      const draft = this.state.draft;
      const question = `Confermi la prenotazione per il ${draft.date!.split("-").reverse().join("/")} alle ${draft.time}, per ${draft.party_size} persone, a nome ${draft.name}?`;
      this.pending = { revision: this.state.revision, expires: now.getTime() + 120_000, question, ready: false };
      result.data = { ...result.data, question };
    }
    return result;
  }

  summaryDelivered(transcript: string, completed: boolean) {
    if (this.pending) this.pending.ready = completed && normalized(transcript) === normalized(this.pending.question);
  }

  beginTurn(id: string) {
    // Only a new audio turn after the complete summary can confirm it.
    this.turn = { id, confirmation: this.pending?.ready ? this.pending : null };
    this.pending = null;
  }

  finishTurn(id: string, transcript: string, now = new Date()) {
    if (this.turn?.id !== id) return null;
    const confirmation = this.turn.confirmation;
    this.turn = null;
    if (!confirmation) return { code: "NOT_SAVED" };
    if (confirmation.revision !== this.state.revision || confirmation.expires < now.getTime()
      || transcript.includes("?") || !affirmative.has(normalized(transcript))) {
      return { code: "CONFIRMATION_REQUIRED" };
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
