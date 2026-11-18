"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserVoice } from "@/lib/voice/browser";
import type { RealtimeVoice } from "@/lib/voice/service";

type VoiceStatus = Awaited<ReturnType<RealtimeVoice["status"]>>;
const usd = (amount: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount);

export function VoiceCall() {
  const voice = useRef(new BrowserVoice());
  const audio = useRef<HTMLAudioElement>(null);
  const phaseRef = useRef("idle");
  const attemptRef = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const [phase, setPhase] = useState("idle");
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [notice, setNotice] = useState("");
  const [caption, setCaption] = useState("");
  const [remaining, setRemaining] = useState(0);

  function changePhase(next: string) { phaseRef.current = next; setPhase(next); }

  useEffect(() => {
    let alive = true, polling = false, lastActive = false;
    const connection = voice.current;
    const refresh = async () => {
      if (polling) return;
      polling = true;
      try {
        const response = await fetch("/api/voice", { cache: "no-store", signal: AbortSignal.timeout(8_000) });
        if (!response.ok) throw new Error("Controllo del budget non disponibile. La voce resta bloccata.");
        const result: VoiceStatus = await response.json();
        if (!alive) return;
        lastActive = Boolean(result.session);
        setStatus(result);
        setRemaining(result.session ? Math.max(0, Math.ceil((result.session.expiresAt - Date.now()) / 1000)) : 0);
        if (phaseRef.current === "active" && (!result.session || result.session.stopping)) {
          phaseRef.current = "idle"; setPhase("idle");
          void connection.stop().catch(() => {});
          setNotice("Chiamata terminata o limite raggiunto. Il microfono è spento.");
        }
      } catch (error) {
        if (alive) {
          setStatus(null); setNotice(error instanceof Error ? error.message : "Servizio non disponibile.");
          if (phaseRef.current === "active") { phaseRef.current = "idle"; setPhase("idle"); void connection.stop().catch(() => {}); }
        }
      } finally { polling = false; }
    };
    refreshRef.current = refresh;
    void refresh();
    const timer = setInterval(() => { if (phaseRef.current !== "idle" || lastActive) void refresh(); }, 1500);
    const leave = () => { attemptRef.current++; void connection.stop().catch(() => {}); };
    window.addEventListener("pagehide", leave);
    return () => { alive = false; refreshRef.current = async () => {}; clearInterval(timer); window.removeEventListener("pagehide", leave); leave(); };
  }, []);

  async function stop() {
    attemptRef.current++;
    changePhase("stopping");
    try {
      await voice.current.stop();
      // Also covers a call retained in the cookie after a page reload.
      const response = await fetch("/api/voice", { method: "DELETE", keepalive: true, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("Microfono spento, ma la chiusura server è da verificare. Riprova Termina.");
      setNotice("Chiamata terminata. Il microfono è spento.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Chiusura da verificare."); }
    finally { changePhase("idle"); void refreshRef.current(); }
  }

  async function start() {
    if (!status?.ready || !audio.current || phaseRef.current !== "idle") return;
    const attempt = ++attemptRef.current;
    changePhase("connecting"); setNotice(""); setCaption("");
    try {
      await voice.current.start(audio.current, setCaption, () => { void stop(); });
      if (attempt === attemptRef.current) changePhase("active");
    } catch (error) {
      if (attempt !== attemptRef.current) return;
      if (error instanceof DOMException && error.name === "NotAllowedError") setNotice("Accesso al microfono negato. Abilitalo nel browser e riprova; nessuna sessione OpenAI è stata aperta.");
      else if (error instanceof DOMException && error.name === "AbortError") setNotice("Chiamata interrotta.");
      else if (error instanceof Error && error.message === "BROWSER_UNSUPPORTED") setNotice("Questo browser non permette la chiamata. Usa un browser con WebRTC e accesso al microfono.");
      else setNotice(error instanceof Error ? error.message : "Connessione non riuscita.");
      changePhase("idle");
      void refreshRef.current();
    }
  }

  const active = phase !== "idle" || Boolean(status?.session);
  return (
    <section className="voice-panel" aria-labelledby="voce">
      <div className="section-heading"><div><p className="eyebrow">02 / Parla con la pizzeria</p><h2 id="voce">La receptionist ti ascolta.</h2></div><span className="badge">OpenAI Realtime · demo</span></div>
      <p>Parli con un assistente AI. L’audio viene elaborato e trascritto da OpenAI; l’app non salva registrazioni o trascrizioni. Usa solo dati fittizi: dopo la tua conferma la prenotazione viene salvata sul computer, nell’archivio della pizzeria demo.</p>
      <div className="voice-budget" aria-label="Controllo della spesa">
        <div><span>Plafond impegnato</span><strong>{status ? usd(status.budget.reservedCents / 100) : "—"} / 9 USD</strong></div>
        <div><span>Oggi, ora italiana</span><strong>{status ? usd(status.budget.dailyCents / 100) : "—"} / {status ? usd(status.policy.dailyCents / 100) : "—"}</strong></div>
        <div><span>Costo stimato dai token</span><strong>{status ? usd(status.budget.observedUsd) : "—"}</strong></div>
      </div>
      <p className="voice-help">Ogni tentativo impegna 0,50 USD del plafond, anche se termina prima. Una chiamata alla volta, massimo 3 minuti. Le stime non sono il saldo o la fattura OpenAI.</p>
      <div className="voice-actions">
        <button type="button" disabled={!status?.ready || active} onClick={() => { void start(); }}>{phase === "connecting" ? "Connessione in corso…" : "Avvia chiamata"}</button>
        <button type="button" className="secondary-button" disabled={!active || phase === "stopping"} onClick={() => { void stop(); }}>Termina e spegni microfono</button>
      </div>
      <p className="voice-message" role="status" aria-live="polite">{status?.paused ? status.message : notice || (phase === "active" ? `Chiamata attiva${status?.session ? ` · ${remaining} secondi disponibili.` : "."}` : status?.message || "Verifica configurazione e budget…")}</p>
      <audio ref={audio} controls autoPlay aria-label="Voce dell’assistente AI" />
      {caption && <p className="voice-caption"><strong>L’assistente:</strong> {caption}</p>}
      {status?.session?.reservation ? <p className="result-success" role="status">Prenotazione salvata: {status.session.reservation.date}, ore {status.session.reservation.time}, {status.session.reservation.party_size} persone, a nome {status.session.reservation.name}. Codice: {status.session.reservation.code}.</p>
        : status?.session?.draft && <p className="voice-help">Da confermare: {status.session.draft.date ?? "data da definire"}, {status.session.draft.time ?? "ora da definire"}, {status.session.draft.party_size ?? "?"} persone.</p>}
    </section>
  );
}
