import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const text = z.string().trim().min(1);
const words = z.array(text);
const count = z.number().int().nonnegative();
const slot = { date: z.iso.date(), time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/) };
const setup = z.strictObject({
  occupied: z.array(z.strictObject({ ...slot, resource: z.enum(["T1","T2","T3","T4"]), name: text.optional() })).optional(),
  faults: z.array(z.enum(["db_down_before_write", "timeout_after_commit"])).optional(),
});
const common = { title: text, covers: words.min(1), tags: words.optional(), setup: setup.optional() };
const conversation = z.strictObject({
  ...common, id: z.string().regex(/^[VRCIAFT]\d{2}$/), tenant: z.literal("pizzeria-demo"), clock: z.iso.datetime({offset: true}),
  channel: z.enum(["web", "phone"]).optional(),
  caller: z.strictObject({ persona: text, goal: text, says: words.min(1), behavior: words.optional(),
    knows: z.record(text, z.union([text, z.number()])).optional(),
    audio: z.strictObject({ noise: text.optional(), pace: text.optional(), accent: text.optional(), codec: text.optional() }).optional() }),
  expect: z.strictObject({
    reservations: z.array(z.strictObject({ ...slot, party_size: z.number().int().min(1).max(4), name: text })),
    handoff: z.enum(["allergen_question","user_request","not_understood","service_error"]).nullish(),
    events_must: words.optional(), events_must_not: words.optional(), max_turns: count.positive(),
    must: words.optional(), must_not: words.optional(),
  }),
});
const system = z.strictObject({ ...common, kind: z.literal("system"), steps: words.optional(), repeat: count.positive().optional() });
const schema = z.union([conversation,
  system.extend({ id: z.literal("S01"), expect: z.strictObject({ rows: count, same_reservation_id: z.boolean() }) }),
  system.extend({ id: z.literal("S02"), expect: z.strictObject({ first: text, second: text, rows: count }) }),
  system.extend({ id: z.literal("S03"), expect: z.strictObject({ confirmed: count, conflict: count, rows_for_T4: count }) }),
  system.extend({ id: z.literal("S04"), expect: z.strictObject({ both: text, rows: count }) }),
]);
export type Conversation = z.infer<typeof conversation>;

export function loadScenarios(dir = join(process.cwd(), "evals", "scenarios")) {
  const ids = new Set<string>();
  return readdirSync(dir).filter(file => /\.ya?ml$/i.test(file)).sort().flatMap(file => {
    try {
      const cases = schema.array().nonempty().parse(parse(readFileSync(join(dir, file), "utf8")));
      for (const scenario of cases) {
        if (ids.has(scenario.id)) throw new Error("ID duplicato: " + scenario.id);
        ids.add(scenario.id);
      }
      return cases;
    } catch (error) { throw new Error(file + ": " + String(error)); }
  });
}
