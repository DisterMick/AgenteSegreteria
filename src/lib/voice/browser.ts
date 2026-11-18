import { voicePolicy } from "./policy";

export class BrowserVoice {
  private peer: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private channel: RTCDataChannel | null = null;
  private audio: HTMLAudioElement | null = null;
  private abort: AbortController | null = null;
  private generation = 0;
  private offered = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  async start(audio: HTMLAudioElement, caption: (text: string) => void, disconnected: () => void) {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") throw new Error("BROWSER_UNSUPPORTED");
    const generation = ++this.generation;
    const current = () => { if (generation !== this.generation) throw new DOMException("Chiamata interrotta", "AbortError"); };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (generation !== this.generation) { stream.getTracks().forEach((track) => track.stop()); current(); }
      this.stream = stream;
      this.timer = setTimeout(() => { disconnected(); void this.stop().catch(() => {}); }, voicePolicy.durationSeconds * 1000);
      this.audio = audio;
      this.abort = new AbortController();
      const peer = new RTCPeerConnection();
      this.peer = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.ontrack = (event) => { audio.srcObject = event.streams[0]; void audio.play().catch(() => caption("Premi Riproduci sul lettore audio per ascoltare l’agente.")); };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(peer.connectionState) && generation === this.generation) disconnected();
      };
      const channel = peer.createDataChannel("oai-events"); this.channel = channel;
      channel.onclose = () => { if (generation === this.generation) disconnected(); };
      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "response.output_audio_transcript.done" && typeof message.transcript === "string") caption(message.transcript.slice(0, 2000));
          if (message.type === "output_audio_buffer.stopped" && typeof message.response_id === "string") {
            void fetch("/api/voice", { method: "PATCH", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "playback_finished", response_id: message.response_id }), signal: AbortSignal.timeout(5000) })
              .then((response) => { if (!response.ok) throw new Error("PLAYBACK_ACK_FAILED"); })
              .catch(() => { if (generation === this.generation) caption("Non riesco a verificare la fine del riepilogo audio. La prenotazione richiede ancora conferma."); });
          }
          if (message.type === "error") disconnected();
        } catch { disconnected(); }
      };
      const offer = await peer.createOffer(); current();
      await peer.setLocalDescription(offer); current();
      this.offered = true;
      const response = await fetch("/api/voice", {
        method: "POST", headers: { "Content-Type": "application/sdp" }, body: offer.sdp,
        signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(30_000)]),
      });
      if (!response.ok) {
        const error = await response.json(); throw new Error(typeof error.message === "string" ? error.message : "Connessione vocale non riuscita.");
      }
      const answer = await response.text(); current();
      await peer.setRemoteDescription({ type: "answer", sdp: answer }); current();
    } catch (error) {
      if (generation === this.generation) await this.stop().catch(() => {});
      throw error;
    }
  }

  async stop() {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort(); this.abort = null;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null;
    this.channel?.close(); this.channel = null;
    this.peer?.close(); this.peer = null;
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null; this.audio = null; }
    const offered = this.offered;
    if (offered) {
      const response = await fetch("/api/voice", { method: "DELETE", keepalive: true, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("Microfono spento. Chiusura server da verificare; nuove chiamate bloccate.");
      this.offered = false;
    }
  }
}
