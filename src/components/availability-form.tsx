"use client";

import { useState, type FormEvent } from "react";
import type { AvailabilityResult } from "@/lib/availability";

type Props = {
  today: string;
  shifts: { start: string; end: string }[];
  maxPartySize: number;
};

export function AvailabilityForm({ today, shifts, maxPartySize }: Props) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AvailabilityResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setResult(null);

    try {
      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: form.get("date"), time: form.get("time"), party_size: Number(form.get("party_size")) }),
      });
      if (!response.ok && response.status !== 400) throw new Error("Verifica non disponibile");
      setResult(await response.json());
    } catch {
      setResult({ status: "invalid", message: "Non riesco a verificare i posti. Riprova tra poco." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} onChange={() => setResult(null)} aria-busy={pending}>
      <fieldset disabled={pending}>
        <legend className="sr-only">Dettagli per la verifica disponibilità</legend>
        <label htmlFor="date">Per quale giorno?</label>
        <input id="date" name="date" type="date" min={today} defaultValue={today} required aria-describedby="date-hint" />
        <small id="date-hint">Fino a 30 giorni da oggi. Lunedì escluso.</small>
        <div className="form-row">
          <div><label htmlFor="time">A che ora?</label><select id="time" name="time">{shifts.map((shift) => <option key={shift.start} value={shift.start}>{shift.start}</option>)}</select></div>
          <div><label htmlFor="party_size">Quante persone?</label><select id="party_size" name="party_size" defaultValue="2">{Array.from({ length: maxPartySize }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} {index === 0 ? "persona" : "persone"}</option>)}</select></div>
        </div>
        <button type="submit">{pending ? "Verifica in corso…" : "Verifica disponibilità"}<span aria-hidden="true">↗</span></button>
      </fieldset>
      <div className="result" role="status" aria-live="polite" aria-atomic="true">
        {result?.status === "available" && <p className="result-success"><strong>C’è posto nella pizzeria demo.</strong>{result.available_tables} tavoli adatti a {result.party_size} {result.party_size === 1 ? "persona" : "persone"}, il {result.date.split("-").reverse().join("/")} alle {result.time}.<small>Questa verifica non blocca il tavolo. Per prenotare, parla con la receptionist.</small></p>}
        {result && result.status !== "available" && <p className="result-error">{result.message}</p>}
      </div>
    </form>
  );
}
