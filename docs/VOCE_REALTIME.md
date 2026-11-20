# Voce nel browser con OpenAI Realtime

Stato: la prova reale del 18 novembre 2026 ha mostrato un ciclo di conferma senza salvataggio e qualità vocale insufficiente. Correzioni, nuovo modello e log sono verificati offline; la nuova configurazione non è ancora stata ascoltata. Le chiamate sono in pausa locale per evitare consumi durante il lavoro.

## Abilitazione locale

1. Crea `.env.local` nella radice del progetto usando `.env.example` come riferimento.
2. Inserisci la tua chiave di progetto in `OPENAI_API_KEY` e imposta `OPENAI_REALTIME_ENABLED=true`. Non usare prefissi `NEXT_PUBLIC_`, non inserire la chiave in chat o in Git.
3. Verifica credito, accesso al modello e controlli di spesa disponibili nell'account OpenAI. Il plafond locale non verifica il saldo del provider.
4. Riavvia `npm run dev` e apri [http://127.0.0.1:3000](http://127.0.0.1:3000).
5. Nella sezione voce premi «Avvia chiamata» e consenti il microfono. Usa cuffie se l'audio rientra nel microfono. Se il browser blocca l'audio automatico, premi Riproduci nel lettore.
6. Parla per primo: «Ciao, vorrei prenotare per oggi alle 21 per due persone». Se il turno è ancora futuro e c'è posto, l'agente chiede il nome. Ascolta il riepilogo completo e rispondi «Sì, confermo»: il controller salva nell'[archivio locale](PRENOTAZIONI_LOCALI.md). Il locale resta fittizio.
7. Premi «Termina e spegni microfono». Se la chiusura non è confermata, riprova Termina: il backend non autorizza nuove sessioni nel frattempo.

Con `OPENAI_REALTIME_ENABLED=false`, o senza chiave, il pulsante resta disabilitato e la verifica testuale continua a funzionare. Nessuna chiamata a OpenAI parte al caricamento della pagina. I test usano esclusivamente servizi simulati.

La presenza di `.local/voice-paused` blocca anche richieste HTTP dirette, prima di impegnare quote o chiamare OpenAI. Per una nuova prova concordata si rimuove solo quel file; non cancellare il ledger o l'archivio prenotazioni. Dopo un riavvio ricontrollare stato e plafond: la pausa non rimborsa tentativi e non aumenta i limiti.

## Trasporto e strumenti

Il browser usa WebRTC per microfono e audio. `POST /api/voice` scambia la SDP con `POST /v1/realtime/calls`: la chiave ordinaria resta sul server e non viene emessa una chiave effimera al client. Una seconda connessione WebSocket autenticata del server osserva gli eventi della stessa chiamata ed esegue `restaurant_action` tramite l'harness esistente.

L'harness conserva bozza e revisione e rifiuta scritture del modello. `check_availability.details` aggiorna e verifica in una chiamata; `prepare_confirmation.name` aggiorna il nome, ricontrolla e prepara il riepilogo. Il controller separato salva solo dopo il turno audio di conferma. Risposte e trascrizioni sono deduplicate per ID; il browser non fornisce stato o contatori attendibili. Il controller registra le richieste per il personale sul disco locale.

L’agente aspetta la prima frase del cliente. Il VAD semantico usa `medium`, la riduzione del rumore `near_field` e la velocità di uscita è 0,95. La pagina mostra l’ultimo turno trascritto. Se il trascrittore assegna a un token di parola una probabilità inferiore a 0,5, il log registra `TRANSCRIPTION_UNCERTAIN` e un eventuale assenso richiede una nuova conferma. È una soglia iniziale da calibrare al microfono. I token e le parole restano transitori. [Configurazione Realtime](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create).

`PATCH /api/voice` accetta solo `{ "type": "playback_finished", "response_id": "..." }`, massimo 1 KB, con origine locale e cookie proprietario. Il browser inoltra il termine audio dal data channel; il server lo associa al proprio riepilogo completato e validato. L'ACK non autorizza scritture: occorre sempre un nuovo assenso audio trascritto sul server, riferito alla revisione corrente. Sono gestiti anche gli ACK arrivati prima di `response.done` o dopo l'inizio/trascrizione del sì (attesa massima 2 secondi). Audio cancellato, riepilogo diverso, correzioni e scadenza restano bloccanti. Dopo due conferme fallite il controller impedisce un altro riepilogo identico.

La demo accetta solo host di loopback. Le richieste di creazione e chiusura richiedono la stessa origine; il cookie di sessione è HttpOnly, SameSite=Strict e limitato al percorso API voce. Non è un'autenticazione adatta a una pubblicazione remota. Non esporre la porta con tunnel o proxy pubblici.

## Limiti effettivi

| Controllo | Impostazione |
| --- | --- |
| Modello | `gpt-realtime-2.1` predefinito oppure `gpt-realtime-2.1-mini` |
| Trascrizione input | `gpt-4o-transcribe`, italiano |
| Voce | `marin` predefinita oppure `cedar`, velocità 0,95 |
| Sessioni simultanee | Una per copia locale del progetto |
| Durata | 180 secondi, timer server e browser |
| Output per risposta | Massimo 1.024 token |
| Risposte per chiamata, inclusi turni strumenti | Massimo 24 |
| Contesto dopo istruzioni | Massimo 2.048 token, con troncamento |
| Stop sul consumo stimato | A 0,30 USD osservati; può restare consumo in corso |
| Quota prudenziale per tentativo | 0,50 USD |
| Plafond giornaliero | 2,00 USD, giorno `Europe/Rome` |
| Plafond totale | 9 USD |

**Il plafond impegnato non è la spesa fatturata.** Ogni tentativo che raggiunge il provider impegna 0,50 USD e non viene rimborsato localmente, nemmeno se termina presto o il provider lo rifiuta. Questo permette al massimo quattro tentativi al giorno e diciotto complessivi. Il plafond giornaliero è stato portato da 1,50 a 2,00 USD su richiesta dell'utilizzatore per provare il nuovo flusso di prenotazione. Il costo stimato dai token viene mostrato separatamente, senza sconti cache per prudenza; non include altri usi dell'account o componenti non osservate.

Il server applica le tariffe del modello scelto prima della chiamata. Per milione di token, il modello completo usa 4/24 USD per testo in ingresso/uscita e 32/64 USD per audio. Il mini usa 0,60/2,40 USD per testo e 10/20 USD per audio. Il conteggio prudenziale addebita alla tariffa audio i token senza dettaglio ed esclude gli sconti cache. Entrambi impegnano la stessa quota locale. [Prezzi OpenAI](https://developers.openai.com/api/docs/pricing).

La trascrizione separata usa `gpt-4o-transcribe`; tutti i suoi token input/output sono stimati prudenzialmente a 20 USD/M, sopra le tariffe della [scheda ufficiale](https://developers.openai.com/api/docs/models/gpt-4o-transcribe). È una sovrastima, non la tariffa fatturata. Uso mancante o invalido chiude la chiamata. Il modello ASR è supportato dal contratto Realtime ma segnalato deprecated: richiederà migrazione quando il provider lo ritirerà. Il 18 novembre 2026 i GET di metadati di entrambi i modelli hanno restituito HTTP 200 con il caricamento ambiente standard di Next.js. Nessuna generazione audio o richiesta a pagamento è stata eseguita: la prova del trasporto e dell'ascolto con il nuovo modello resta aperta.

Rendicontazione ritardata, risposte già in corso, cambi tariffari, errori di chiusura e arresti del processo impediscono di garantire un tetto di fatturazione esatto. I timer e il margine riducono lo scostamento; verificare anche i controlli e i consumi sul provider. Non aumentare il plafond o cancellare i contatori per recuperare da un errore senza prima riconciliare l'uso effettivo.

## Persistenza e recupero

`.local/voice-budget.json`, escluso da Git, conserva quote impegnate, giorno locale, costo stimato cumulativo e riferimento tecnico dell'eventuale chiamata attiva. Scritture protette da lock esclusivo e sostituzione atomica impediscono che richieste concorrenti azzerino i contatori. Non vengono scritti audio, trascrizioni, nomi o chiavi nel ledger.

Ricaricare la pagina o riavviare Next.js non azzera le quote. Dopo un riavvio, il backend tenta di chiudere una chiamata persistita prima di consentirne altre. Se il provider non conferma la chiusura, la sessione resta bloccata. Se una creazione va in timeout prima di restituire un ID, non si può dimostrare dal backend che non sia stata aperta: la demo resta bloccata e serve verificare lo stato su OpenAI.

Un lock rimasto dopo un arresto improvviso o un ledger corrotto blocca il servizio. Non cancellare `.local/` come soluzione generica. A processo fermo, verifica sul provider che non esistano chiamate attive e riconcilia i consumi; conserva il ledger. Solo un lock residuo, dopo tali verifiche, può essere rimosso. Per un risultato di creazione incerto occorre una riconciliazione manuale prima di rimuovere il relativo riferimento attivo, senza azzerare le quote.

Questa persistenza è adatta al laboratorio con un solo server Node e disco locale; prima di serverless, repliche o hosting remoto serve un archivio condiviso e autenticazione del personale. La bozza resta solo in memoria e viene persa alla chiusura/riavvio.

## Verifiche

### Diagnostica locale

`.local/voice-events.jsonl` contiene eventi strutturati con un UUID diagnostico distinto dal cookie, orario, revisione, esito, durate, token e stima di costo. Registra modello/ASR all'avvio, esiti degli strumenti, fine audio e provenienza del riscontro, esito della conferma, errori provider consentiti e chiusura. Non contiene nomi, dettagli delle prenotazioni, ID di sessione privati, chiavi, audio o trascrizioni. I campi sono in allowlist; codici arbitrari diventano `UNKNOWN`. Due file ruotati a circa 256 KiB ciascuno limitano lo spazio. Nessun invio a servizi di logging.

| Codice | Che cosa controllare |
| --- | --- |
| `PLAYBACK_PENDING` | Manca ancora il riscontro audio; confrontare gli eventi `playback` server/browser |
| `SUMMARY_MISMATCH` | Il testo generato non coincide con una variante equivalente del riepilogo atteso |
| `SUMMARY_INTERRUPTED` / `SUMMARY_INCOMPLETE` | Il riepilogo è stato cancellato o la generazione non è completa |
| `AMBIGUOUS_REPLY` | Assenso non inequivocabile; nessun salvataggio |
| `STALE_CONFIRMATION` / `EXPIRED_CONFIRMATION` | Dati cambiati o conferma scaduta |
| `VOICE_CONFIRMATION_FAILED` | Due fallimenti: fermare il ciclo, non fingere successo |
| `SAVE_FAILED` / `NO_AVAILABILITY` | Archivio non scrivibile o tavolo non più libero |
| `OUTPUT_LIMIT` / `COST_LIMIT` / `DURATION_LIMIT` | Risposta o chiamata terminata da un limite |
| `CLOSE_FAILED` / `CONTROL_ERROR` | Chiusura o canale server incerti; verificare prima di riavviare |

Per una prova, seguire la sequenza con lo stesso `trace`: ASR → strumento → riepilogo → `SUMMARY_READY` → `RESERVATION_SAVED` → `CLOSED`. `duration_ms` degli eventi `transcription` misura l'attesa dopo fine parlato; `FIRST_AUDIO` misura il primo segnale audio/testuale dopo la richiesta di risposta, non il tempo realmente percepito all'altoparlante. Nessuna riga consente di ricostruire parole fraintese: per quella verifica serve l'ascolto manuale. Non esistono log retroattivi delle prove precedenti.

I test coprono quota giornaliera/totale, concorrenza, riavvio, contatori corrotti, deduplicazione, strumenti vietati, timer, chiusura incerta, origine HTTP, dimensione SDP, segreti non esposti, microfono negato e rilascio risorse. La prima sessione reale è riportata nel [benchmark](VOICE_BENCHMARK.md): non sostituisce il campione conversazionale, le prove di interruzione o la riconciliazione della fattura provider.

Riferimenti ufficiali: [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime), [controllo server](https://developers.openai.com/api/docs/guides/voice-server-controls?voice-api=realtime), [chiusura delle chiamate WebRTC](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/hangup).
