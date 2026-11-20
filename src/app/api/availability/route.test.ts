import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { reservations } from "@/lib/reservations";

beforeEach(() => {
  vi.spyOn(reservations, "read").mockReturnValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T17:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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

  it("usa i tavoli occupati e non espone nomi o identificativi privati", async () => {
    vi.mocked(reservations.read).mockReturnValue(["T3", "T4"].map((table_id) => ({ id: "private", session_id: "private-session", revision: 1, date: "2026-11-19", time: "19:00", party_size: 4, name: "Nome Privato", table_id, created_at: "2026-11-18T12:00:00Z" })));
    const response = await POST(new Request("http://localhost/api/availability", { method: "POST", body: JSON.stringify({ date: "2026-11-19", time: "19:00", party_size: 4 }) }));
    const result = await response.json();
    expect(result.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("Privato");
  });

  it("non inventa posti se l'archivio è illeggibile", async () => {
    vi.mocked(reservations.read).mockImplementation(() => { throw new Error("corrupt"); });
    const response = await POST(new Request("http://localhost/api/availability", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
  });

  it("rifiuta input forgiati anche senza usare l'interfaccia", async () => {
    const response = await POST(new Request("http://localhost/api/availability", {
      method: "POST", body: JSON.stringify({ date: "2026-11-19", time: "19:00", party_size: 5, admin: true }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: "invalid" });
  });
});
