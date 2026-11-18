import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserVoice } from "./browser";

let track: { stop: ReturnType<typeof vi.fn<() => void>> };
let audio: HTMLAudioElement;
let network: ReturnType<typeof vi.fn<typeof fetch>>;
let media: ReturnType<typeof vi.fn>;
let closePeer: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  track = { stop: vi.fn() }; closePeer = vi.fn();
  media = vi.fn().mockResolvedValue({ getTracks: () => [track] });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: media } });
  vi.stubGlobal("RTCPeerConnection", class {
    addTrack() {}
    createDataChannel() { return { close: vi.fn(), send: vi.fn() }; }
    async createOffer() { return { type: "offer", sdp: "v=0\r\noffer" }; }
    async setLocalDescription() {}
    async setRemoteDescription() {}
    close() { closePeer(); }
  });
  network = vi.fn<typeof fetch>().mockResolvedValue(new Response("v=0\r\nanswer")); vi.stubGlobal("fetch", network);
  audio = { pause: vi.fn(), srcObject: null } as unknown as HTMLAudioElement;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("risorse vocali del browser", () => {
  it("spegne microfono, peer e audio e richiede la chiusura server", async () => {
    const voice = new BrowserVoice(); await voice.start(audio, vi.fn(), vi.fn()); await voice.stop();
    expect(track.stop).toHaveBeenCalledOnce(); expect(closePeer).toHaveBeenCalledOnce();
    expect(network.mock.calls[1][1]).toMatchObject({ method: "DELETE", keepalive: true });
    expect(audio.srcObject).toBeNull();
  });
  it("non chiama il server se il microfono è negato", async () => {
    media.mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
    await expect(new BrowserVoice().start(audio, vi.fn(), vi.fn())).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });
  it("spegne le risorse anche se la connessione OpenAI non riesce", async () => {
    network.mockResolvedValueOnce(Response.json({ message: "Servizio non disponibile" }, { status: 503 }));
    await expect(new BrowserVoice().start(audio, vi.fn(), vi.fn())).rejects.toThrow("Servizio non disponibile");
    expect(track.stop).toHaveBeenCalledOnce(); expect(closePeer).toHaveBeenCalledOnce();
  });
  it("non avvia una chiamata se lo stop arriva mentre si attende il microfono", async () => {
    let grant: (value: unknown) => void = () => {};
    media.mockReturnValue(new Promise((resolve) => { grant = resolve; }));
    const voice = new BrowserVoice(); const start = voice.start(audio, vi.fn(), vi.fn());
    await voice.stop(); grant({ getTracks: () => [track] });
    await expect(start).rejects.toThrow("Chiamata interrotta");
    expect(track.stop).toHaveBeenCalledOnce(); expect(network).not.toHaveBeenCalled();
  });
  it("spegne il microfono al termine anche se il backend non risponde più", async () => {
    vi.useFakeTimers();
    const voice = new BrowserVoice(); const ended = vi.fn(); await voice.start(audio, vi.fn(), ended);
    network.mockRejectedValue(new Error("Server offline"));
    await vi.advanceTimersByTimeAsync(180_001);
    expect(ended).toHaveBeenCalledOnce(); expect(track.stop).toHaveBeenCalledOnce();
  });
  it("una vecchia richiesta microfono non interrompe una chiamata successiva", async () => {
    let grant: (value: unknown) => void = () => {};
    media.mockReturnValueOnce(new Promise((resolve) => { grant = resolve; }));
    const newTrack = { stop: vi.fn() };
    media.mockResolvedValueOnce({ getTracks: () => [newTrack] });
    const voice = new BrowserVoice(); const previous = voice.start(audio, vi.fn(), vi.fn());
    await voice.stop(); await voice.start(audio, vi.fn(), vi.fn());
    grant({ getTracks: () => [track] }); await expect(previous).rejects.toThrow("Chiamata interrotta");
    expect(newTrack.stop).not.toHaveBeenCalled(); await voice.stop();
  });
});
