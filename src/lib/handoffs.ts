import { createHash, randomUUID } from "node:crypto";
import { linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

import { handoffReason } from "./agent/harness";
const record = z.strictObject({ reference: z.uuid(), reason: handoffReason, at: z.iso.datetime() });
export type Handoff = z.infer<typeof record>;

export function handoffPath(archivePath: string, session: string) {
  const key = createHash("sha256").update(session).digest("hex");
  return join(dirname(archivePath), "handoffs", key + ".json");
}

export function registerHandoff(path: string, reason: Handoff["reason"], now: Date): Handoff {
  const row = record.parse({ reference: randomUUID(), reason, at: now.toISOString() });
  mkdirSync(dirname(path), { recursive: true });
  const temp = path + "." + row.reference + ".tmp";
  writeFileSync(temp, JSON.stringify(row), { flag: "wx", mode: 0o600 });
  try {
    // Linking publishes the complete record only if no request already exists for this call.
    linkSync(temp, path);
    return row;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return record.parse(JSON.parse(readFileSync(path, "utf8")));
  } finally { unlinkSync(temp); }
}
