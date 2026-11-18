import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), status: vi.fn() }));
vi.mock("@/lib/voice/service", () => ({ realtimeVoice: service }));
import { DELETE, GET, POST } from "./route";

function request(method: string, origin: string | null = "http://127.0.0.1:3000", body = "v=0\r\nsdp") {
  const headers = new Headers({ "Content-Type": "application/sdp" });
  if (origin) headers.set("Origin", origin);
  return new Request("http://127.0.0.1:3000/api/voice", { method, headers, ...(method === "POST" ? { body } : {}) });
}
beforeEach(() => {
  vi.clearAllMocks(); service.status.mockResolvedValue({ ready: false, message: "Configura la voce" });
  service.start.mockResolvedValue({ id: "test-session", sdp: "v=0\r\nanswer" }); service.stop.mockResolvedValue(undefined);
});

describe("confine HTTP voce locale", () => {
  it("rifiuta origini esterne e origine assente prima di qualsiasi chiamata a pagamento", async () => {
    for (const origin of ["https://attacker.example", null]) expect((await POST(request("POST", origin))).status).toBe(403);
    expect(service.start).not.toHaveBeenCalled();
  });
  it("non abilita la voce su un host pubblico", async () => {
    const response = await GET(new Request("https://demo.example/api/voice"));
    expect(response.status).toBe(403); expect(service.status).not.toHaveBeenCalled();
  });
  it("limita il corpo e rifiuta input diversi da una SDP", async () => {
    expect((await POST(request("POST", undefined, "not sdp"))).status).toBe(400);
    expect((await POST(request("POST", undefined, "v=0" + "x".repeat(33_000)))).status).toBe(413);
    expect(service.start).not.toHaveBeenCalled();
  });
  it("consegna solo SDP e cookie privato, senza credenziali OpenAI", async () => {
    const response = await POST(request("POST"));
    expect(response.status).toBe(201); expect(await response.text()).toContain("answer");
    expect(response.headers.get("Set-Cookie")).toMatch(/HttpOnly; SameSite=Strict/);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("non espone errori del provider o segreti al client", async () => {
    service.start.mockRejectedValue(new Error("Authorization: secret-value"));
    const response = await POST(request("POST"));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret-value");
  });
  it("lega lo stop alla sessione nel cookie", async () => {
    const input = request("DELETE"); input.headers.set("Cookie", "pizzeria_voice=owned");
    expect((await DELETE(input)).status).toBe(200);
    expect(service.stop).toHaveBeenCalledWith("owned");
  });
});
