# Contratti degli strumenti e dati

Implementazione attuale: [prenotazioni persistenti locali](PRENOTAZIONI_LOCALI.md). `restaurant_action` invia proposte all'harness; il modello non può invocare scritture. `check_availability` accetta `details` opzionali e `prepare_confirmation` accetta `name`. Il controller salva solo dopo riepilogo riprodotto e conferma nel nuovo turno audio, legata alla revisione corrente. Sessione e input audio provengono dal canale server OpenAI; stato/stop HTTP dal cookie locale. Handoff e contratti DB/pannello indicati sotto restano futuri; il laboratorio applica lock e unicità nel file locale, usando sessione/revisione come chiave idempotente e UUID come identificativo.

## Dati del ristorante demo

**Pizzeria Demo** è un locale inventato. Questi dati servono solo a rendere ripetibili le prove; non descrivono un'attività reale.

| Voce | Valore iniziale proposto |
| --- | --- |
| Lingua e fuso | Italiano, `Europe/Rome` |
| Apertura | Martedì–domenica, 19:00–23:00; lunedì chiuso |
| Turni prenotabili | 19:00–21:00 e 21:00–23:00, intervalli senza sovrapposizione |
| Tavoli | T1 e T2 da 2 posti; T3 e T4 da 4 posti |
| Regola coperti | Da 1 a 4; un tavolo per prenotazione; tavoli non unibili |
| Orizzonte | Fino a 30 giorni dalla data corrente del ristorante, solo turni futuri |
| Menu fittizio | Margherita: grano e latte; marinara: grano |
| Servizi | Consumazione al tavolo; altre richieste al personale |

Il menu non garantisce assenza di contaminazioni. Una richiesta di sicurezza alimentare non documentata passa al personale. Non raccogliere diagnosi o dettagli medici nelle note.

Il file `src/data/restaurant.json` include versione e data di revisione ed è validato al caricamento. Per i test si fissa l'orologio a una data nota e si usano date future rispetto a quell'orologio; niente fixture che scadono con il calendario.

## Strumenti consentiti

| Nome | Input applicativo | Output utile all'agente | Permessi |
| --- | --- | --- | --- |
| `get_restaurant_info` | `topic`: `hours`, `menu`, `allergens`, `services` | Contenuto approvato, versione; `unknown` se manca | Sola lettura dei contenuti pubblici |
| `check_availability` | `date` YYYY-MM-DD, `time` HH:mm, `party_size` intero 1–4, `revision` corrente | `available`, opzioni con data/ora/coperti, revisione; nessun dato cliente | Sola lettura, nessun blocco tavolo |
| `create_reservation` | `draft_id`, `revision`, `confirmation_id`, `idempotency_key` | `confirmed` con `reservation_id`, codice pubblico e riepilogo, oppure errore | Solo bozza confermata della sessione corrente |
| `request_human_handoff` | `reason`: `user_request`, `not_understood`, `allergen_question`, `service_error` | `requested` e riferimento, oppure `unavailable` | Crea una richiesta interna senza accesso alle altre prenotazioni |

Per ogni invocazione il server assegna `request_id` e correla sessione, revisione, strumento, durata ed esito. Nessuno strumento accetta SQL, URL arbitrari, privilegi o ristorante scelto dal modello. Gli output non includono messaggi interni del database o credenziali.

La bozza è mantenuta dal controller sulla base dei dati raccolti: `draft_id`, `revision`, data, ora, coperti e nome. L'integrazione dovrà definire il formato degli eventi di aggiornamento; questi non autorizzano di per sé alcuna scrittura.

## Conferma e stato

Stati della bozza: `collecting` → `available` → `awaiting_confirmation` → `confirmed`. Una correzione torna a `collecting`; un conflitto richiede nuove opzioni; un timeout di scrittura porta a `outcome_unknown` fino a riconciliazione.

- Nome obbligatorio, non vuoto, massimo proposto di 80 caratteri; niente recapito obbligatorio nella demo.
- Date relative come «domani» si risolvono nel fuso del locale. Se data o turno sono ambigui, chiedere chiarimento e riepilogare una data completa.
- Il server rifiuta date passate, giorni chiusi, turni non previsti e coperti fuori limite.
- Il controller genera `confirmation_id` solo dopo riepilogo e conferma esplicita riferita alla revisione corrente. Un parametro `confirmed: true` inviato dal modello non è prova sufficiente.
- La conferma è associata a sessione, bozza, revisione e dettagli; scade dopo due minuti o alla prima modifica. Il client non sceglie il contenuto di un'autorizzazione server.
- La decisione che un «sì» confermi la bozza deve essere verificata contro il turno effettivo dell'utente e il riepilogo emesso; audio o trascrizione ambigui richiedono una nuova domanda. Nessuna pretesa di prova certa dell'intenzione attraverso il solo modello.
- Nel laboratorio il browser può inoltrare `playback_finished` con il solo ID di risposta; il server lo correla al proprio riepilogo completato e validato. Il riscontro non sostituisce il nuovo assenso ASR e non seleziona dettagli o permessi. Cancellazione audio, revisione e scadenza prevalgono; dopo due fallimenti non si ripete lo stesso riepilogo.
- Dopo due tentativi di chiarimento senza esito, proporre handoff. Nella demo significa richiesta visibile nel pannello, non una telefonata trasferita.

## Persistenza minima

| Entità | Campi essenziali | Vincoli |
| --- | --- | --- |
| Tavoli | ID e posti | ID unico; posti positivi |
| Prenotazioni | UUID, codice pubblico casuale, tavolo, data locale, turno, coperti, nome, creazione UTC, sessione, bozza/revisione | Unicità tavolo/data/turno; coperti compatibili; una prenotazione per bozza |
| Operazioni idempotenti | Sessione, chiave, impronta della richiesta normalizzata, riferimento esito | Unicità sessione/chiave; chiave uguale e contenuto diverso → conflitto |
| Richieste al personale | ID, sessione, motivo, stato e creazione UTC | Nessun testo libero con dati personali nella prima versione |
| Eventi tecnici | Request/session ID, strumento, revisione, esito, durata, uso e costo stimato | Niente nome, audio, chiavi o trascrizioni nei log |

Bozze e conferme possono restare nello stato server della sessione per il laboratorio: se il processo riparte si richiede una nuova conferma. Operazioni idempotenti e prenotazioni devono invece sopravvivere a retry e riavvii; non basta una mappa in memoria.

## Salvataggio atomico

Verifica della disponibilità, assegnazione del tavolo, consumo della conferma e registrazione dell'esito idempotente fanno parte di un'unica operazione transazionale. Usare locking e vincoli DB; non una sequenza separata «leggi disponibilità, poi inserisci» priva di protezione concorrente.

Assegnare il tavolo idoneo più piccolo, con ID come spareggio. Se un inserimento incontra concorrenza, rivalutare gli altri tavoli idonei nella transazione o restituire conflitto senza confermare. La regola a turni fissi rende sufficiente l'unicità tavolo/data/turno; per durate libere andrà sostituita con un vincolo contro intervalli sovrapposti.

Stessa sessione, stessa chiave e stessa richiesta restituiscono lo stesso risultato persistito. Una seconda chiave per la stessa bozza non deve creare una seconda prenotazione. Dopo un timeout non generare una nuova chiave per tentare alla cieca.

## Errori applicativi comuni

| Codice | Significato | Comportamento conversazionale |
| --- | --- | --- |
| `VALIDATION_ERROR` | Dati incompleti o non validi | Chiedere il dato da correggere |
| `STALE_REQUEST` | Revisione superata | Scartare l'esito e usare la bozza corrente |
| `CONFIRMATION_REQUIRED` | Conferma assente, scaduta o non pertinente | Nuovo riepilogo e conferma |
| `NO_AVAILABILITY` | Nessun tavolo idoneo | Proporre opzioni effettive |
| `IDEMPOTENCY_CONFLICT` | Chiave riusata con dati diversi | Non scrivere; nuova verifica del flusso |
| `UNAUTHORIZED` | Sessione o permessi non validi | Nessuna operazione; ripristinare accesso legittimo |
| `SERVICE_UNAVAILABLE` | Servizio indisponibile | Dichiarare impossibilità di completare |
| `OUTCOME_UNKNOWN` | Possibile commit, risposta non ricevuta | Riconciliare prima di confermare o riprovare |
| `BUDGET_EXCEEDED` | Nuove operazioni a pagamento sospese | Chiudere in modo comprensibile senza promettere prenotazioni |

Il codice pubblico di prenotazione non autorizza la lettura di dettagli personali né modifiche o cancellazioni.
