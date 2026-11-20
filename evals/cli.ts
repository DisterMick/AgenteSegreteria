import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadScenarios, type Conversation } from "./scenarios";
import { runCase, score, type Attempt } from "./runner";
import { scriptedIds, scriptedRoles } from "./scripted";
import { estimatePerAttempt, model, modelRoles, TextBudget } from "./text-model";

async function main() {
  const { values } = parseArgs({ options: { scripted: { type: "boolean" }, paid: { type: "boolean" }, "max-usd": { type: "string" } } });
  if ((values.paid && values.scripted) || (!values.paid && values["max-usd"] !== undefined)) throw new Error("Combinazione di flag non valida");
  if (values.paid && (process.env.CI || process.env.GITHUB_ACTIONS || process.env.VITEST)) throw new Error("Modalità a pagamento disabilitata in CI e nei test");
  const budget = values.paid ? new TextBudget(Number(values["max-usd"])) : null;
  const catalog = loadScenarios();
  const eligible = catalog.filter((s): s is Conversation => !("kind" in s) && s.channel !== "phone" && (!values.scripted || scriptedIds.has(s.id)));
  const planned = eligible.reduce((n, s) => n + (s.id.startsWith("V") ? 3 : 1), 0);
  console.log(eligible.length + " scenari, " + planned + " conversazioni. Stima indicativa: " +
    (values.scripted ? "0" : (planned * estimatePerAttempt).toFixed(2)) + " USD." +
    (budget ? " Tetto complessivo: " + values["max-usd"] + " USD." : ""));
  if (!values.scripted && !values.paid) {
    console.log("Solo anteprima. --scripted esegue i copioni gratuiti. --paid --max-usd IMPORTO avvia la prova testuale a pagamento.");
    return;
  }
  let key = "";
  if (budget) {
    if (!process.env.OPENAI_API_KEY && existsSync(".env.local")) process.loadEnvFile(".env.local");
    key = process.env.OPENAI_API_KEY?.trim() ?? "";
    if (!key) throw new Error("OPENAI_API_KEY mancante");
  }
  const dir = join(process.cwd(), ".local", "eval-reports");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, randomUUID() + ".json");
  const attempts: (Attempt & { repeat: number })[] = [];
  const skipped = catalog.filter(s => !eligible.some(e => e.id === s.id)).map(s => ({
    id: s.id, reason: "kind" in s ? "SYSTEM_TEST" : s.channel === "phone" ? "PHONE_CHANNEL" : "NO_SCRIPT" }));
  const report = () => {
    writeFileSync(file + ".tmp", JSON.stringify({ mode: budget ? "paid" : "scripted", model: budget ? model : null,
      capUsd: budget ? Number(values["max-usd"]) : 0, usd: budget?.usd ?? 0, planned, skipped, attempts, bookings: score(attempts) }, null, 2), { mode: 0o600 });
    renameSync(file + ".tmp", file);
  };
  report();
  console.log("Rapporto locale: " + file);
  // One pass over all valid fixtures before repeating them.
  const ordered = [...eligible].sort((a, b) => Number(b.id.startsWith("V")) - Number(a.id.startsWith("V")) || a.id.localeCompare(b.id));
  for (let repeat = 1; repeat <= 3; repeat++) {
    for (const s of ordered) {
      if (repeat > 1 && !s.id.startsWith("V")) continue;
      const result = await runCase(s, budget ? modelRoles(s, budget, key) : scriptedRoles(s));
      attempts.push({ ...result, repeat });
      report();
      if (result.problems.length || result.semantic === "fail" || result.stop) process.exitCode = 1;
      if (result.stop && ["BUDGET_LIMIT", "UNKNOWN_USAGE", "PROVIDER_ERROR"].includes(result.stop)) return;
    }
  }
  console.log(JSON.stringify(score(attempts)));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Errore del runner"); process.exitCode = 1; });
