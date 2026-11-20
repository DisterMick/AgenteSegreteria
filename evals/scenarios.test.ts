import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect } from "vitest";
import { loadScenarios } from "./scenarios";

it("valida il catalogo e include le 20 prenotazioni valide", () => {
  const all = loadScenarios();
  expect(all.length).toBeGreaterThanOrEqual(51);
  expect(all.filter(s => s.id.startsWith("V")).map(s => s.id).sort()).toEqual(Array.from({ length: 20 }, (_, n) => "V" + String(n+1).padStart(2,"0")));
});
it("segnala campi non validi e ID ripetuti tra file", () => {
  const dir = mkdtempSync(join(tmpdir(), "scenario-contract-"));
  try {
    const [sample] = loadScenarios();
    writeFileSync(join(dir,"a.yaml"),JSON.stringify([sample]));
    writeFileSync(join(dir,"b.yaml"),JSON.stringify([sample]));
    expect(() => loadScenarios(dir)).toThrow(/b.yaml.*ID duplicato/);
    writeFileSync(join(dir,"b.yaml"),JSON.stringify([{ ...sample, clock: false }]));
    expect(() => loadScenarios(dir)).toThrow(/b.yaml/);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
