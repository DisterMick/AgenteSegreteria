import { fixedCaller, type Participants } from "./runner";
import type { Conversation } from "./scenarios";

const bookings: Record<string, string> = { V01: "Rossi", C01: "Neri", A03: "Testa" };
export const scriptedIds = new Set([...Object.keys(bookings), "I04", "I05", "I06"]);
export function scriptedRoles(s: Conversation): Participants {
  if (!scriptedIds.has(s.id)) throw new Error("NO_SCRIPT");
  const turns = [...s.caller.says];
  if (s.id === "V01") turns.push("Sì, perfetto.");
  if (s.id === "I04") turns.push("Certo, grazie.");
  if (s.id === "I06") turns.push("...sab...", "...per...", "Sì.");
  let step = 0;
  return {
    cost: () => 0,
    caller: fixedCaller(turns, s.id === "C01" ? "silence" : "hangup"),
    receptionist: async (_clock, _lines, _results, expected_revision) => {
      step++;
      if (s.id === "I06") return { action: { type: "report_unclear_input", expected_revision } };
      if (s.id === "I04" && step === 1) return { action: { type: "get_restaurant_info", topic: "allergens", expected_revision } };
      if (s.id === "I04" && step === 2) return { text: "Nel menu non ci sono pizze senza glutine. Non posso garantire l’assenza di contaminazioni. Vuoi che registri una richiesta per il personale?" };
      if (s.id === "I04" || s.id === "I05") return { action: { type: "request_human_handoff", reason: s.id === "I04" ? "allergen_question" : "user_request", expected_revision } };
      if (step === 1) return { action: { type: "check_availability", details: { date: "2026-11-19", time: "19:00", party_size: 2 }, expected_revision } };
      return { action: { type: "prepare_confirmation", name: bookings[s.id], expected_revision } };
    },
  };
}
