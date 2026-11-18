# Voce nel browser con OpenAI Realtime

Stato: integrazione implementata, verificata con servizi simulati e con una prima sessione OpenAI reale il 18 novembre 2026. Verificati connessione, generazione audio e chiusura; restano da valutare qualità percepita, conversazione completa e interruzioni del parlato.

## Abilitazione locale

1. Crea `.env.local` nella radice del progetto usando `.env.example` come riferimento.
2. Inserisci la tua chiave di progetto in `OPENAI_API_KEY` e imposta `OPENAI_REALTIME_ENABLED=true`. Non usare prefissi `NEXT_PUBLIC_`, non inserire la chiave in chat o in Git.
3. Verifica credito, accesso al modello e controlli di spesa disponibili nell'account OpenAI. Il plafond locale non verifica il saldo del provider.
4. Riavvia `npm run dev` e apri [http://127.0.0.1:3000](http://127.0.0.1:3000).
5. Nella sezione voce premi «Avvia chiamata» e consenti il microfono. Usa cuffie se l'audio rientra nel microfono. Se il browser blocca l'audio automatico, premi Riproduci nel lettore.
6. Parla per primo: «Ciao, vorrei prenotare per oggi alle 21 per due persone». Se il turno è ancora futuro e c'è posto, l'agente chiede il nome. Ascolta il riepilogo completo e rispondi «Sì, confermo»: il controller salva nell'[archivio locale](PRENOTAZIONI_LOCALI.md). Il locale resta fittizio.
7. Premi «Termina e spegni microfono». Se la chiusura non è confermata, riprova Termina: il backend non autorizza nuove sessioni nel frattempo.

Con `OPENAI_REALTIME_ENABLED=false`, o senza chiave, il pulsante resta disabilitato e la verifica testuale continua a funzionare. Nessuna chiamata a OpenAI parte al caricamento della pagina. I test usano esclusivamente servizi simulati.

## Trasporto e strumenti

Il browser usa WebRTC per microfono e audio. `POST /api/voice` scambia la SDP con `POST /v1/realtime/calls`: la chiave ordinaria resta sul server e non viene emessa una chiave effimera al client. Una seconda connessione WebSocket autenticata del server osserva gli eventi della stessa chiamata ed esegue `restaurant_action` tramite l'harness esistente.

L'harness conserva bozza e revisione e rifiuta scritture del modello. `check_availability.details` aggiorna e verifica in una chiamata; `prepare_confirmation.name` aggiorna il nome, ricontrolla e prepara il riepilogo. Il controller separato salva solo dopo il turno audio di conferma. Risposte e trascrizioni sono deduplicate per ID; il browser non fornisce stato o contatori attendibili. L'handoff resta non implementato.

Nessun saluto automatico: informativa AI/demo nella pagina. VAD semantico `auto` e risposte fino a 1.024 token sostituiscono silenzio fisso di 600 ms e tetto di 256 token che poteva troncare il parlato. Il server attende la trascrizione prima di chiedere la risposta, evitando una corsa tra conferma e modello. Latenza aggiuntiva e qualità audio vanno ancora provate dal vivo. Vedi [VAD ufficiale](https://developers.openai.com/api/docs/guides/realtime-vad).

La demo accetta solo host di loopback. Le richieste di creazione e chiusura richiedono la stessa origine; il cookie di sessione è HttpOnly, SameSite=Strict e limitato al percorso API voce. Non è un'autenticazione adatta a una pubblicazione remota. Non esporre la porta con tunnel o proxy pubblici.

## Limiti effettivi

| Controllo | Impostazione |
| --- | --- |
| Modello | `gpt-realtime-2.1-mini` |
| Voce | `marin` |
| Sessioni simultanee | Una per copia locale del progetto |
| Durata | 180 secondi, timer server e browser |
| Output per risposta | Massimo 1.024 token |
| Risposte per chiamata, inclusi turni strumenti | Massimo 24 |
| Contesto dopo istruzioni | Massimo 2.048 token, con troncamento |
| Stop sul consumo stimato | A 0,40 USD osservati; può restare consumo in corso |
| Quota prudenziale per tentativo | 0,50 USD |
| Plafond giornaliero | 1,50 USD, giorno `Europe/Rome` |
| Plafond totale | 9 USD |

**Il plafond impegnato non è la spesa fatturata.** Ogni tentativo che raggiunge il provider impegna 0,50 USD e non viene rimborsato localmente, nemmeno se termina presto o il provider lo rifiuta. Questo permette al massimo tre tentativi al giorno e diciotto complessivi. Il plafond giornaliero è stato portato da 1 a 1,50 USD su richiesta dell'utilizzatore per consentire un'ulteriore prova manuale. Il costo stimato dai token viene mostrato separatamente, senza sconti cache per prudenza; non include altri usi dell'account o componenti non osservate.

Le tariffe Realtime usate nella stima sono in USD per milione di token: testo input 0,60/output 2,40; audio input 10/output 20. Se mancano i dettagli viene applicata la tariffa audio più alta. La trascrizione input separata usa `gpt-4o-mini-transcribe` in italiano; per prudenza tutti i suoi token input/output sono stimati a 20 USD/M, sopra le tariffe della [scheda ufficiale](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe). È una sovrastima, non la tariffa fatturata. I consumi ASR concorrono allo stesso stop a 0,40 USD. Uso mancante o invalido chiude la chiamata. Il modello ASR è supportato dal contratto Realtime ma segnalato deprecated: richiederà migrazione quando il provider lo ritirerà.

Rendicontazione ritardata, risposte già in corso, cambi tariffari, errori di chiusura e arresti del processo impediscono di garantire un tetto di fatturazione esatto. I timer e il margine riducono lo scostamento; verificare anche i controlli e i consumi sul provider. Non aumentare il plafond o cancellare i contatori per recuperare da un errore senza prima riconciliare l'uso effettivo.

## Persistenza e recupero

`.local/voice-budget.json`, escluso da Git, conserva quote impegnate, giorno locale, costo stimato cumulativo e riferimento tecnico dell'eventuale chiamata attiva. Scritture protette da lock esclusivo e sostituzione atomica impediscono che richieste concorrenti azzerino i contatori. Non vengono scritti audio, trascrizioni, nomi o chiavi nel ledger.

Ricaricare la pagina o riavviare Next.js non azzera le quote. Dopo un riavvio, il backend tenta di chiudere una chiamata persistita prima di consentirne altre. Se il provider non conferma la chiusura, la sessione resta bloccata. Se una creazione va in timeout prima di restituire un ID, non si può dimostrare dal backend che non sia stata aperta: la demo resta bloccata e serve verificare lo stato su OpenAI.

Un lock rimasto dopo un arresto improvviso o un ledger corrotto blocca il servizio. Non cancellare `.local/` come soluzione generica. A processo fermo, verifica sul provider che non esistano chiamate attive e riconcilia i consumi; conserva il ledger. Solo un lock residuo, dopo tali verifiche, può essere rimosso. Per un risultato di creazione incerto occorre una riconciliazione manuale prima di rimuovere il relativo riferimento attivo, senza azzerare le quote.

Questa persistenza è adatta al laboratorio con un solo server Node e disco locale; prima di serverless, repliche o hosting remoto serve un archivio condiviso e autenticazione del personale. La bozza resta solo in memoria e viene persa alla chiusura/riavvio.

## Verifiche

I test coprono quota giornaliera/totale, concorrenza, riavvio, contatori corrotti, deduplicazione, strumenti vietati, timer, chiusura incerta, origine HTTP, dimensione SDP, segreti non esposti, microfono negato e rilascio risorse. La prima sessione reale è riportata nel [benchmark](VOICE_BENCHMARK.md): non sostituisce il campione conversazionale, le prove di interruzione o la riconciliazione della fattura provider.

Riferimenti ufficiali: [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime), [controllo server](https://developers.openai.com/api/docs/guides/voice-server-controls?voice-api=realtime), [chiusura delle chiamate WebRTC](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/hangup).
