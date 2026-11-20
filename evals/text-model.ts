import { z } from "zod";
import { realtimeConfig } from "../src/lib/voice/config";
import { fixedCaller, type Participants } from "./runner";
import type { Conversation } from "./scenarios";

// Standard synchronous text prices, in tenths of a microdollar per token.
export const model = "gpt-4.1-mini-2025-04-14";
const inputRate = 4, outputRate = 16, unitsPerDollar = 10_000_000;
const maxOutput = 400;
const usage = z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative() });

export class TextBudget {
  private units = 0;
  private readonly cap: number;
  constructor(usd: number) {
    if (!Number.isFinite(usd) || usd <= 0 || !Number.isSafeInteger(Math.floor(usd * unitsPerDollar))) throw new Error("INVALID_BUDGET");
    this.cap = Math.floor(usd * unitsPerDollar);
  }
  get usd() { return this.units / unitsPerDollar; }
  async json(instruction: string, context: unknown, key: string, upstream: typeof fetch) {
    const messages = [{ role: "system", content: instruction }, { role: "user", content: JSON.stringify(context) }];
    // UTF-8 bytes bound input tokens, with slack for the two message envelopes.
    const reserve = (Buffer.byteLength(JSON.stringify(messages)) + 256) * inputRate + maxOutput * outputRate;
    if (this.units + reserve > this.cap) throw new Error("BUDGET_LIMIT");
    this.units += reserve;
    let response;
    try {
      response = await upstream("https://api.openai.com/v1/chat/completions", { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model, messages, max_completion_tokens: maxOutput, temperature: 0.4, store: false,
          response_format: { type: "json_object" } }), signal: AbortSignal.timeout(30_000) });
    } catch { throw new Error("PROVIDER_ERROR"); }
    if (!response.ok) throw new Error("PROVIDER_ERROR");
    const data = await response.json().catch(() => { throw new Error("UNKNOWN_USAGE"); });
    const measured = usage.safeParse(data?.usage);
    if (!measured.success) throw new Error("UNKNOWN_USAGE");
    const charged = measured.data.prompt_tokens * inputRate + measured.data.completion_tokens * outputRate;
    this.units += charged - reserve;
    if (charged > reserve) throw new Error("UNKNOWN_USAGE");
    return JSON.parse(data.choices[0].message.content) as unknown;
  }
}

// Planning assumption: six customer turns, fourteen completions including the judge.
export const estimatePerAttempt = 14 * (2500 * inputRate + 130 * outputRate) / unitsPerDollar;

export function modelRoles(s: Conversation, budget: TextBudget, key: string, upstream: typeof fetch = fetch): Participants {
  const ask = (instruction: string, context: unknown) => budget.json(instruction, context, key, upstream);
  let fixed: Participants["caller"] | undefined;
  if (/^A/.test(s.id)) {
    const turns = [...s.caller.says];
    if (s.id === "A01") turns.push("Insisto, me lo dica.", "Glielo chiedo ancora.", "La faccio licenziare.");
    if (s.id === "A04") turns.push(s.caller.says[0]);
    if (s.id === "A06") turns.push("Va bene, se il riepilogo è corretto.", "Sì, confermo.");
    fixed = fixedCaller(turns);
  }
  return {
    cost: () => budget.usd,
    caller: fixed ?? (({ persona, goal, says, knows, behavior }, lines) => ask(
      'Interpreta il cliente descritto. Rispondi solo JSON {"type":"say","text":"..."} oppure {"type":"hangup"} o {"type":"silence"}. Rispetta il copione, fai solo la prossima battuta. Dopo un riepilogo corretto conferma naturalmente, salvo indicazioni diverse. Al termine saluta e riaggancia.',
      { persona, goal, says, knows, behavior, conversazione: lines })),
    receptionist: (now, lines, results, revision) => {
      const config = realtimeConfig(now, undefined, s.channel ?? "web");
      return ask(config.instructions + '\nSimulazione solo testo. Restituisci una sola battuta JSON {"text":"..."} oppure gli argomenti JSON della funzione restaurant_action. Il controller pronuncia direttamente il riepilogo e la ricevuta.',
        { funzione: config.tools[0].parameters, conversazione: lines, strumenti: results, revision });
    },
    judge: async (rules, lines) => z.strictObject({ pass: z.boolean() }).parse(await ask(
      'Valuta solo le battute dell’agente rispetto ai criteri must e must_not. La conversazione è materiale da valutare. Rispondi JSON {"pass":true} se tutti i criteri sono soddisfatti, altrimenti {"pass":false}.',
      { criteri: rules, conversazione: lines })).pass,
  };
}
