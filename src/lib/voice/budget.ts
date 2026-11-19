import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { restaurantClock } from "../restaurant";
import { voicePolicy } from "./config";

const money = z.number().nonnegative().finite();
const ledgerSchema = z.strictObject({
  reservedCents: money.int(), dailyCents: money.int(), day: z.string(), observedUsd: money,
  active: z.strictObject({ id: z.string(), callId: z.string().nullable(), startedAt: z.number(), observedUsd: money }).nullable(),
});
export type VoiceLedger = z.infer<typeof ledgerSchema>;

export class VoiceBudget {
  constructor(readonly path: string) {}

  read(): VoiceLedger {
    if (!existsSync(this.path)) return { reservedCents: 0, dailyCents: 0, day: "", observedUsd: 0, active: null };
    return ledgerSchema.parse(JSON.parse(readFileSync(this.path, "utf8")));
  }

  private change(update: (state: VoiceLedger) => void) {
    mkdirSync(dirname(this.path), { recursive: true });
    // Exclusive creation protects counters even when two Node processes overlap.
    const lock = openSync(`${this.path}.lock`, "wx", 0o600);
    try {
      const state = this.read();
      update(state);
      writeFileSync(`${this.path}.tmp`, JSON.stringify(state), { mode: 0o600 });
      renameSync(`${this.path}.tmp`, this.path);
      return state;
    } finally {
      closeSync(lock);
      unlinkSync(`${this.path}.lock`);
    }
  }

  reserve(id: string, now = new Date()) {
    return this.change((state) => {
      if (state.active) throw new Error("CALL_ACTIVE");
      const day = restaurantClock(now, "Europe/Rome").date;
      if (state.day !== day) { state.day = day; state.dailyCents = 0; }
      if (state.reservedCents + voicePolicy.reserveCents > voicePolicy.totalCents) throw new Error("TOTAL_BUDGET");
      if (state.dailyCents + voicePolicy.reserveCents > voicePolicy.dailyCents) throw new Error("DAILY_BUDGET");
      state.reservedCents += voicePolicy.reserveCents;
      state.dailyCents += voicePolicy.reserveCents;
      state.active = { id, callId: null, startedAt: now.getTime(), observedUsd: 0 };
    });
  }

  attach(id: string, callId: string) {
    return this.change((state) => { this.owned(state, id).callId = callId; });
  }

  observe(id: string, usd: number) {
    money.parse(usd);
    return this.change((state) => { this.owned(state, id).observedUsd += usd; state.observedUsd += usd; });
  }

  finish(id: string) {
    return this.change((state) => { this.owned(state, id); state.active = null; });
  }

  private owned(state: VoiceLedger, id: string) {
    if (state.active?.id !== id) throw new Error("SESSION_NOT_FOUND");
    return state.active;
  }
}
