import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T17:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("POST /api/availability", () => {
  it("restituisce una disponibilità simulata senza dati personali", async () => {
    const response = await POST(new Request("http://localhost/api/availability", {
      method: "POST", body: JSON.stringify({ date: "2026-11-19", time: "19:00", party_size: 4 }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "available", date: "2026-11-19", time: "19:00", party_size: 4, available_tables: 2, simulated: true,
    });
  });

  it("gestisce JSON malformato senza errore interno", async () => {
    const response = await POST(new Request("http://localhost/api/availability", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: "invalid" });
  });

  it("rifiuta input forgiati anche senza usare l'interfaccia", async () => {
    const response = await POST(new Request("http://localhost/api/availability", {
      method: "POST", body: JSON.stringify({ date: "2026-11-19", time: "19:00", party_size: 5, admin: true }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: "invalid" });
  });
});
