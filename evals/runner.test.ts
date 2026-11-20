import { spawnSync } from "node:child_process";
import { expect, it, vi } from "vitest";
import { loadScenarios, type Conversation } from "./scenarios";
import { fixedCaller, runCase, score } from "./runner";
import { scriptedIds, scriptedRoles } from "./scripted";
import { modelRoles, TextBudget } from "./text-model";

const cases = loadScenarios().filter((s): s is Conversation => !("kind" in s));
const get = (id: string) => cases.find(s => s.id === id)!;

it.each([...scriptedIds])("%s passa da turni, controller e archivio temporaneo", async id => {
  const s = get(id);
  const result = await runCase(s, scriptedRoles(s));
  expect(result).toMatchObject({ verified: true, problems: [], usd: 0, semantic: "unchecked" });
  expect(result.tools.length).toBeGreaterThan(0);
  if (id === "V01") expect(result.events).toContain("RESERVATION_SAVED");
  if (id === "C01" || id === "A03") {
    expect(result.events).toContain("SUMMARY_READY");
    expect(result.events).toContain(id === "C01" ? "INPUT_TIMEOUT" : "CALL_ENDED");
  }
  if (id === "I06") expect(result.events).toContain("HANDOFF_OFFERED");
});
it("un giudizio favorevole non nasconde un archivio errato o una prova vuota", async () => {
  const s = get("V01");
  const result = await runCase(s, { ...scriptedRoles(s), caller: fixedCaller([]), judge: async () => true });
  expect(result.problems).toEqual(expect.arrayContaining(["NO_AGENT_REPLY", "RESERVATIONS"]));
  expect(result.semantic).toBe("pass");
});
it("la semantica e il costo del giudice restano separati dalla verifica dell'archivio", async () => {
  const s = get("V01");
  const result = await runCase(s, { ...scriptedRoles(s), judge: async () => { throw new Error("BUDGET_LIMIT"); } });
  expect(result).toMatchObject({ verified: true, problems: [], semantic: "unchecked", stop: "BUDGET_LIMIT" });
  expect(score([result])).toEqual({ correct: 1, finished: 1, planned: 60, complete: false, percent: null });
  const full = cases.filter(s => s.id.startsWith("V")).flatMap(s => Array.from({ length: 3 }, () => ({ ...result, id: s.id })));
  expect(score(full)).toMatchObject({ percent: 100, complete: true });
});
it("nessuna richiesta parte se il costo massimo del turno supera il residuo", async () => {
  const budget = new TextBudget(0.00001);
  const upstream = vi.fn<typeof fetch>();
  await expect(budget.json("JSON", {}, "fake", upstream)).rejects.toThrow("BUDGET_LIMIT");
  expect(upstream).not.toHaveBeenCalled();
  expect(budget.usd).toBe(0);
});
it("il cliente riceve solo il proprio copione e le battute pubbliche, il costo viene riconciliato", async () => {
  const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: '{"type":"hangup"}' } }], usage: { prompt_tokens: 100, completion_tokens: 5 } }));
  const budget = new TextBudget(0.02);
  const s = get("V01");
  await modelRoles(s, budget, "fake", upstream).caller(s.caller, []);
  const submission = JSON.parse(String(upstream.mock.calls[0][1]?.body));
  expect(Object.keys(JSON.parse(submission.messages[1].content)).sort()).toEqual(["behavior","conversazione","goal","knows","persona","says"]);
  expect(budget.usd).toBeCloseTo(0.000048, 9);
});
it("un errore di rete conserva la riserva. CI rifiuta il flag a pagamento prima delle credenziali", async () => {
  const budget = new TextBudget(0.02);
  await expect(budget.json("test", {}, "fake", vi.fn().mockRejectedValue(new Error("network")))).rejects.toThrow("PROVIDER_ERROR");
  expect(budget.usd).toBeGreaterThan(0);
  const cli = spawnSync(process.execPath, ["--import", "tsx", "evals/cli.ts", "--paid", "--max-usd", "1"], {
    encoding: "utf8", env: { ...process.env, CI: "true", OPENAI_API_KEY: "" } });
  expect(cli.status).toBe(1);
  expect(cli.stderr).toContain("disabilitata in CI");
});
