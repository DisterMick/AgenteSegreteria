export function controllerLine(code: string) {
  switch (code) {
    case "HANDOFF_REQUESTED": return "Ho registrato la richiesta per il personale.";
    case "HANDOFF_FAILED": return "Non sono riuscita a registrare la richiesta per il personale.";
    case "HANDOFF_OFFERED": case "VOICE_CONFIRMATION_FAILED": return "Non ho prenotato il tavolo. Vuoi che registri una richiesta per il personale?";
    case "CLARIFICATION_REQUIRED": return "Non ho capito bene. Puoi ripetere l’ultimo dettaglio?";
    case "USER_DECLINED": return "Va bene, nessuna prenotazione. Buona giornata!";
    case "SAVE_FAILED": return "Non riesco a verificare il salvataggio. Rivolgiti al personale prima di riprovare.";
  }
}
