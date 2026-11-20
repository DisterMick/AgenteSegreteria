# Benchmark delle voci — Protocollo iniziale

**Stato:** protocollo comparativo ancora da eseguire. Prima verifica operativa di OpenAI Realtime completata il 18 novembre 2026; non è un confronto tra voci né una misura di naturalità.

## Selezione dei candidati — 19 novembre 2026

Decisione proposta: confrontare prima OpenAI completo con due voci, ElevenLabs Realtime v1 Max e Gemini 3.8 Live. Cartesia resta il candidato per una pipeline con sintesi separata. È una priorità di valutazione basata sui contratti documentati, non una classifica di qualità già misurata.

| Candidato | Che cosa confrontiamo | Conseguenza per questa app |
| --- | --- | --- |
| OpenAI `gpt-realtime-2.1`, `marin` e `cedar` | Stesso agente e stesse regole; isolare la preferenza per il timbro | Integrazione esistente; cambiare voce richiede una nuova sessione. `cedar` non è un diverso modello di comprensione |
| OpenAI `gpt-realtime-2.1-mini` | Confronto economico sullo stesso flusso di conferma | Selezionabile dal browser con Marin o Cedar prima della chiamata |
| ElevenLabs Realtime v1 Max | Conversazione completa: ascolto, turni, ragionamento, strumenti e voce | Prima alternativa per la pizzeria; API compatibile con il protocollo OpenAI via WebSocket, ma il nostro trasporto WebRTC e i controlli server richiedono adattamento |
| Google `gemini-3.8-live` | Seconda alternativa audio-audio con function calling e italiano | Adapter Live API, credenziali Google e gestione di eventi, conferma e costi da verificare prima dell'uso |
| Cartesia `sonic-3.6-2026-08-27` | Sintesi del medesimo testo italiano con una voce adatta al locale | Solo TTS: richiede STT e modello conversazionale separati; da solo non migliora la comprensione. Snapshot fissato per ripetibilità |

Fonti ufficiali: [voci e configurazione OpenAI](https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create), [modelli ElevenLabs](https://elevenlabs.io/docs/eleven-agents/customization/realtime-models), [compatibilità ElevenLabs](https://elevenlabs.io/docs/eleven-agents/guides/openai-realtime-compatibility), [Gemini 3.8 Live](https://aistudio.google.com/docs/models/gemini-3.8-live), [lingue Live API](https://aistudio.google.com/docs/live-api/capabilities), [Sonic 3.6 e italiano](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest).

Per ElevenLabs e Cartesia scegliere dal catalogo una voce con italiano convincente, evitando di assumere che una voce dimostrativa inglese sia adatta al locale. Il relativo ID va fissato dopo ascolto, non inventato durante la preparazione.

### Costi e perimetro

- **OpenAI completo:** tariffe e stop stimato già in [VOCE_REALTIME.md](VOCE_REALTIME.md). Il confronto `marin`/`cedar` usa lo stesso modello.
- **ElevenLabs Realtime v1 Max:** listino API consultato: audio connesso 0,08 USD/min, più token input 1,80 USD/M e output 9 USD/M. Non interpretare 0,08 USD/min come costo totale della conversazione; verificare piano, crediti e condizioni dell'account prima della prova. [Listino](https://elevenlabs.io/pricing/api).
- **Gemini 3.8 Live:** listino pagato: audio input 3 USD/M token (indicazione equivalente 0,005 USD/min di audio input), output audio 12 USD/M (0,018 USD/min di audio generato); testo input/output 0,75/4,50 USD/M. Non sommare questi valori come tariffa fissa per minuto di chiamata: contesto, testo e strumenti vanno conteggiati. [Listino](https://aistudio.google.com/docs/pricing#gemini-3.8-live).
- **Cartesia:** piano e crediti per TTS, oltre ai costi STT/LLM e dell'eventuale infrastruttura. Il listino offre anche un piano gratuito per valutazione, soggetto alle condizioni dell'account. [Listino](https://www.cartesia.ai/pricing).

Il ledger attuale conta soltanto le chiamate OpenAI dell'app. Prima di integrare un altro provider occorre collegarne tutti i consumi allo stesso controllo di spesa: non esiste già un plafond condiviso che copra automaticamente i servizi esterni. Nessun account creato, nuova chiave richiesta, adattatore installato o test audio avviato in questa selezione; la pausa locale resta attiva. La proposta non autorizza nuovo budget.

### Ordine delle prove quando autorizzate

1. Stesse frasi con `marin` e `cedar` sul modello OpenAI completo, ora ancora da ascoltare dopo le correzioni.
2. Stesso scenario di prenotazione con ElevenLabs Max, poi Gemini Live: nome insolito fittizio, ora, correzione dei coperti, interruzione e conferma. Controllare il file persistito, non solo la risposta parlata.
3. Cartesia sul medesimo testo di risposta se serve migliorare ulteriormente la sintesi; valutare a parte la latenza dell'intera pipeline.

Nomi di prova: «Giulia D'Angelo», «Niccolò Test», «Rossi». Date e turni da generare nel fuso del locale e nel suo orizzonte prenotabile. Pesi di scelta proposti: comprensione di nomi/date e gestione delle correzioni 40%, naturalezza/pronuncia 30%, latenza e interruzioni 20%, costo completo 10%. Un salvataggio senza conferma valida o un falso successo escludono il candidato anche se la voce piace.

### Opzione locale successiva

[Qwen3-TTS-12Hz-1.7B](https://github.com/QwenLM/Qwen3-TTS) documenta italiano e streaming. Resta un TTS da integrare, non un agente completo: verificare hardware, prestazioni e condizioni di modello/voce prima di proporlo come soluzione economica. Nessuna GPU o installazione locale verificata. CosyVoice e MOSS restano ricerca futura, fuori dalla prima selezione.

## Script fisso in italiano

1. Accoglienza: «Buonasera, Pizzeria Demo, sono Giulia. Come posso aiutarla?»
2. Prenotazione: «Un tavolo per quattro persone venerdì 27 novembre alle nove di sera, corretto?»
3. Correzione: «Scusi, avevo capito sabato. Mi ha detto domenica 29 novembre?»
4. Numero e conferma: «Prenotazione numero 1042. Le ripeto: due persone, ore ventuno.»
5. Allergeni: «La pizza Margherita contiene grano e latte. Per informazioni su possibili contaminazioni chiedo al personale.»
6. Ripresa dopo interruzione: interrompere la voce a metà risposta e cambiare coperti e data.

Il testo di prova può includere richieste non prenotabili: qui si misura la qualità della voce, non il booking engine.

## Misurazioni

| Metrica | Come rilevarla |
| --- | --- |
| Naturalità | Ascolto cieco: voto da 1 a 5, almeno 3 ascoltatori quando disponibili |
| Pronuncia | Errori verificati manualmente per date, orari, nomi e allergeni |
| Primo audio utile | Fine turno utente → primo audio udibile, p50/p95 con numero di campioni |
| Interruzione | Intervallo da inizio nuovo parlato allo stop audio dell'agente |
| Robustezza | Errori, timeout, salti vocali e continuità timbrica |
| Costi | Token/minuti, eventuale GPU, infrastruttura e costo telefonico separato |

Usare almeno tre ripetizioni per script e per modello con hardware, versione, lingua, voce e parametri documentati. Non confrontare un TTS isolato con una pipeline end-to-end come se la latenza fosse la stessa.

## Esito

Registrare per ogni candidato: data, versione, licenza, ambiente, audio d'esempio solo con contenuti fittizi, metriche, difetti e decisione. **Nessun vincitore è stato scelto né verificato qui.**

### Prima verifica operativa — 18 novembre 2026

| Voce | Risultato osservato |
| --- | --- |
| Ambiente | Next.js locale, browser integrato, WebRTC e controllo server WebSocket |
| Modello / voce | `gpt-realtime-2.1-mini` / `marin` |
| Accesso | Chiave valida e accesso al modello confermati con HTTP 200; segreto escluso da Git |
| Generazione | Risposta reale `completed`; output audio osservato e lettore in riproduzione |
| Richiesta di prova | Domanda testuale sul menu inviata nella stessa sessione tramite il canale di controllo, senza aprire una seconda chiamata |
| Risposta visibile | Testo dell'assistente sul menu fittizio, con riferimento alla Margherita e ai suoi ingredienti |
| Chiusura | Lettore arrestato, microfono spento e nessuna chiamata attiva nel backend |
| Costo stimato cumulativo | 0,0136104 USD, calcolato dai token; non è una fattura riconciliata |
| Plafond impegnato | 1 USD giornaliero/complessivo: due tentativi da 0,50 USD, incluso il precedente rifiuto per chiave non valida |
| Nuove chiamate | Bloccate dal limite giornaliero; contatori e soglie non azzerati |

Non sono state misurate latenza p50/p95, naturalità, pronuncia o qualità del barge-in. L'ascolto percepito e una conversazione vocale completa richiedono ancora conferma dell'utilizzatore e prove dedicate. Nessuna registrazione audio è stata salvata.
