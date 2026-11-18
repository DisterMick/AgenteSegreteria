import { mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { VoiceDiagnostics } from "./diagnostics";

const directory = mkdtempSync(join(tmpdir(), "pizzeria-diagnostics-"));
afterEach(() => rmSync(directory, { recursive: true, force: true }));

it("conserva solo campi consentiti, maschera codici arbitrari e ruota il file", () => {
  const path = join(directory, "events.jsonl"); const logger = new VoiceDiagnostics(path);
  logger.write(randomUUID(), { event: "error", code: "secret-name-value", reason: "secret-transcript-value", name: "secret-name-value", transcript: "secret-transcript-value", key: "secret-key-value" } as never);
  const row = JSON.parse(readFileSync(path, "utf8"));
  expect(row).toMatchObject({ code: "UNKNOWN", reason: "UNKNOWN" });
  expect(JSON.stringify(row)).not.toContain("secret");
  writeFileSync(path, "x".repeat(262_144));
  logger.write(randomUUID(), { event: "confirmation", code: "CONFIRMATION_REQUIRED", reason: "PLAYBACK_PENDING", revision: 2 });
  expect(statSync(`${path}.1`).size).toBe(262_144);
  expect(readFileSync(path, "utf8")).toContain("PLAYBACK_PENDING");
});
