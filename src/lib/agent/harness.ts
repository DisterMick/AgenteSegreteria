import { z } from "zod";
import { checkAvailability } from "../availability";
import { restaurant } from "../restaurant";

/**
 * Offline, model-independent foundation for the future agent.
 *
 * A model may PROPOSE one of the allowlisted actions below; the controller
 * checks the proposal, owns the booking draft and never persists a reservation.
 * Never accept AgentSessionState from a browser in a production endpoint.
 */
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const revisionSchema = z.number().int().min(0);
const partySizeSchema = z.number().int().min(1).max(restaurant.max_party_size);
const nameSchema = z.string().trim().min(1).max(80);

const draftChangesSchema = z.strictObject({
  date: z.iso.date().nullable().optional(),
  time: timeSchema.nullable().optional(),
  party_size: partySizeSchema.nullable().optional(),
  name: nameSchema.nullable().optional(),
}).refine((value) => Object.keys(value).length > 0);

const actionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("update_draft"),
    expected_revision: revisionSchema,
    changes: draftChangesSchema,
  }),
  z.strictObject({
    type: z.literal("check_availability"),
    expected_revision: revisionSchema,
  }),
  z.strictObject({
    type: z.literal("prepare_confirmation"),
    expected_revision: revisionSchema,
  }),
  z.strictObject({
    type: z.literal("get_restaurant_info"),
    expected_revision: revisionSchema,
    topic: z.enum(["hours", "menu", "allergens", "services"]),
  }),
  z.strictObject({
    type: z.literal("request_human_handoff"),
    expected_revision: revisionSchema,
    reason: z.enum(["user_request", "not_understood", "allergen_question", "service_error"]),
  }),
]);

export type AgentProposal = z.infer<typeof actionSchema>;
export type BookingDraft = {
  date: string | null;
  time: string | null;
  party_size: number | null;
  name: string | null;
};
export type AgentSessionState = {
  revision: number;
  draft: BookingDraft;
  availability_revision: number | null;
  awaiting_confirmation_revision: number | null;
};
export type AgentOutcome = {
  status: "ok" | "blocked";
  code: string;
  state: AgentSessionState;
  data?: Record<string, unknown>;
};

export function createAgentSessionState(): AgentSessionState {
  return {
    revision: 0,
    draft: { date: null, time: null, party_size: null, name: null },
    availability_revision: null,
    awaiting_confirmation_revision: null,
  };
}

function blocked(state: AgentSessionState, code: string): AgentOutcome {
  return { status: "blocked", code, state };
}

/**
 * This is deliberately NOT an HTTP endpoint or a booking API.
 * Session authenticity, confirmation evidence, concurrency and persistence
 * require a trusted server-side implementation in subsequent milestones.
 */
export function processAgentProposal(
  state: AgentSessionState,
  input: unknown,
  now: Date = new Date(),
): AgentOutcome {
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) {
    return blocked(state, "INVALID_OR_UNAUTHORIZED_ACTION");
  }

  const action = parsed.data;
  if (action.expected_revision !== state.revision) {
    return blocked(state, "STALE_REQUEST");
  }

  switch (action.type) {
    case "update_draft": {
      const nextDraft: BookingDraft = { ...state.draft, ...action.changes };
      const changed = (Object.keys(action.changes) as Array<keyof BookingDraft>)
        .some((field) => state.draft[field] !== nextDraft[field]);

      if (!changed) {
        return { status: "ok", code: "UNCHANGED", state };
      }

      const nextState: AgentSessionState = {
        revision: state.revision + 1,
        draft: nextDraft,
        availability_revision: null,
        awaiting_confirmation_revision: null,
      };
      return { status: "ok", code: "DRAFT_UPDATED", state: nextState };
    }

    case "check_availability": {
      const { date, time, party_size } = state.draft;
      if (!date || !time || !party_size) {
        return blocked(state, "MISSING_BOOKING_DETAILS");
      }
      const result = checkAvailability({ date, time, party_size }, now);
      if (result.status === "invalid") {
        return blocked(state, "INVALID_AVAILABILITY");
      }

      return {
        status: "ok",
        code: "AVAILABILITY_SIMULATED",
        state: {
          ...state,
          availability_revision: state.revision,
          awaiting_confirmation_revision: null,
        },
        data: {
          date: result.date,
          time: result.time,
          party_size: result.party_size,
          available_tables: result.available_tables,
          simulated: true,
        },
      };
    }

    case "prepare_confirmation": {
      if (!state.draft.name || !state.draft.date || !state.draft.time || !state.draft.party_size) {
        return blocked(state, "MISSING_BOOKING_DETAILS");
      }
      if (state.availability_revision !== state.revision) {
        return blocked(state, "AVAILABILITY_CHECK_REQUIRED");
      }
      return {
        status: "ok",
        code: "AWAITING_USER_CONFIRMATION",
        state: { ...state, awaiting_confirmation_revision: state.revision },
        data: { ...state.draft, simulated: true, persisted: false },
      };
    }

    case "get_restaurant_info": {
      const info = {
        hours: { opening_days: restaurant.opening_days, hours: restaurant.hours, shifts: restaurant.shifts },
        menu: restaurant.menu,
        allergens: { menu: restaurant.menu.map((item) => ({ name: item.name, allergens: item.allergens })), notice: restaurant.allergen_notice },
        services: restaurant.services,
      };
      return { status: "ok", code: "PUBLIC_INFO", state, data: { topic: action.topic, value: info[action.topic] } };
    }

    case "request_human_handoff":
      return blocked(state, "HANDOFF_NOT_IMPLEMENTED");
  }
}
