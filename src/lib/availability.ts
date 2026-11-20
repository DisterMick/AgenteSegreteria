import { z } from "zod";
import { bookingRequestSchema, evaluateAvailability, type OccupiedTable } from "@/domain/booking/availability";
import { restaurant, restaurantClock } from "./restaurant";

export type { OccupiedTable };
export const availabilityRequestSchema = bookingRequestSchema.extend({
  party_size: z.number().int().min(1).max(restaurant.max_party_size),
});

function availabilityMessage(result: Exclude<ReturnType<typeof evaluateAvailability>, { status: "available" }>) {
  switch (result.code) {
    case "INVALID_INPUT": return "Controlla data, ora e numero di persone.";
    case "PARTY_SIZE_OUT_OF_RANGE": return `Puoi prenotare per un gruppo da ${result.params.min} a ${result.params.max} persone.`;
    case "DATE_OUT_OF_RANGE": return `Scegli una data da oggi ai prossimi ${result.params.days} giorni.`;
    case "CLOSED_DAY": return "Il locale è chiuso quel giorno. Scegli un’altra data.";
    default: {
      const reason = { INVALID_SHIFT: "A quest’ora non inizia un turno.", SHIFT_STARTED: "Questo turno è già iniziato.", NO_AVAILABILITY: "Per questo turno i tavoli adatti sono occupati." }[result.code];
      return result.alternatives.length
        ? `${reason} Per lo stesso giorno c’è posto alle ${result.alternatives.join(" oppure alle ")}.`
        : `${reason} Per questo gruppo non ci sono altri turni disponibili quel giorno.`;
    }
  }
}

export function checkAvailability(input: unknown, now = new Date(), occupied: OccupiedTable[] = []) {
  const result = evaluateAvailability(input, restaurant, restaurantClock(now), occupied);
  return result.status === "available" ? result : { ...result, message: availabilityMessage(result) };
}
export type AvailabilityResult = ReturnType<typeof checkAvailability>;
