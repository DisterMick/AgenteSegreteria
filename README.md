# Agente Segreteria

Receptionist AI vocale in italiano per un ristorante: risponde alle domande, verifica i tavoli disponibili e crea prenotazioni dopo la conferma del cliente.

**Stato al 18 novembre 2026:** app locale Next.js/TypeScript con disponibilità simulata, harness e integrazione OpenAI Realtime nel browser. La voce richiede una chiave server e abilitazione esplicita; l'audio reale non è ancora stato collaudato con credenziali. Salvataggio prenotazioni, autenticazione per hosting e database non sono implementati.

Repository GitHub: [DisterMick/AgenteSegreteria](https://github.com/DisterMick/AgenteSegreteria).

## Primo risultato da ottenere

Dal browser, premere «Avvia chiamata», chiedere un tavolo alla pizzeria fittizia, confermare il riepilogo e vedere una sola prenotazione corretta nel database e nel pannello del personale.

Il modello interpreta la conversazione; il backend applica i permessi e le regole; il database decide se la prenotazione può essere salvata. Una conferma pronunciata dall'agente non prova che il salvataggio sia riuscito.

## Documenti

| Documento | Contenuto |
| --- | --- |
| [Requisiti di prodotto](docs/PRD-agente-segreteria.md) | Obiettivi, utenti, perimetro e criteri di successo |
| [Architettura](docs/ARCHITETTURA.md) | Componenti, flussi e scelte tecniche proposte |
| [Contratti e dati](docs/CONTRATTI_E_DATI.md) | Strumenti dell'agente, stato della prenotazione e dati demo |
| [Sicurezza e privacy](docs/SICUREZZA_E_PRIVACY.md) | Confini di fiducia, accessi, dati personali e costi |
| [Collaudo](docs/COLLAUDO.md) | Casi normali, errori, attacchi e metriche |
| [Piano di sviluppo](docs/PIANO_DI_SVILUPPO.md) | Fasi, dipendenze e condizioni per avanzare |
| [Voce Realtime](docs/VOCE_REALTIME.md) | Configurazione, limiti effettivi, costi e recupero |

## Perimetro della prima versione

- Conversazione vocale in italiano con gestione di interruzioni e correzioni.
- Informazioni approvate su orari, menu, allergeni e servizi.
- Ricerca disponibilità e nuova prenotazione con conferma esplicita.
- Richiesta di intervento umano; nel laboratorio viene simulata e mostrata nel pannello.
- Pannello protetto per consultare prenotazioni ed errori, con dati personali ridotti al necessario.
- Tracce tecniche, misure di qualità e controllo della spesa.

Pagamenti, modifiche e cancellazioni di prenotazioni esistenti, integrazioni con gestionali commerciali, più ristoranti e telefonia reale sono fuori dalla prima versione.

## Avvio locale

Requisiti: Node.js 22.12 o successivo della serie 22, oppure Node.js 24, con npm. Le versioni delle dipendenze sono fissate in `package.json` e `package-lock.json`.

```sh
npm ci
npm run dev
```

Aprire [http://127.0.0.1:3000](http://127.0.0.1:3000). La verifica testuale e i test non richiedono credenziali e non generano consumi API. Per parlare con l'agente crea `.env.local` con `OPENAI_API_KEY` e `OPENAI_REALTIME_ENABLED=true`, poi riavvia il server: vedi [configurazione voce](docs/VOCE_REALTIME.md). Non incollare la chiave in chat né in variabili pubbliche.

La chiamata impegna 0,50 USD del plafond locale: massimo 1 USD al giorno, 9 USD complessivi, tre minuti e una chiamata alla volta. Il costo stimato dai token è separato dalla quota impegnata e dal saldo OpenAI. Il caricamento della pagina non avvia chiamate a pagamento.

La verifica accetta date future entro 30 giorni nel fuso `Europe/Rome`, giorni di apertura, turni delle 19:00 o 21:00 e gruppi da 1 a 4. Tutti i tavoli del simulatore partono liberi: nessuna richiesta blocca posti o salva prenotazioni.

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm start
```

`npm start` avvia la build di produzione già generata. I server ascoltano solo sull'indirizzo locale; lo scheletro non è una demo remota protetta.

## Struttura dello scheletro

| Percorso | Responsabilità |
| --- | --- |
| `src/app/` | Pagina, layout, stili e API HTTP |
| `src/components/availability-form.tsx` | Modulo con attesa, esito ed errori |
| `src/data/restaurant.json` | Dati fittizi versionati del locale |
| `src/lib/restaurant.ts` | Validazione del dataset e orologio del ristorante |
| `src/lib/availability.ts` | Regole condivise di disponibilità simulata |
| `src/lib/agent/harness.ts` | Controller puro: allowlist, bozza, revisioni e blocco delle scritture |
| `src/lib/voice/` | WebRTC browser, controllo server, plafond persistente e stima consumi |
| `src/app/api/voice/route.ts` | Avvio, stato e stop della sessione locale, con verifica origine e cookie privato |
| `*.test.ts` | Prove deterministiche delle regole e del confine HTTP |

`POST /api/availability` accetta soltanto `{ "date": "YYYY-MM-DD", "time": "HH:mm", "party_size": 2 }`. Risponde con `status: "available"`, dettagli, conteggio tavoli idonei e `simulated: true`, oppure HTTP 400 con `status: "invalid"` e un messaggio. La voce usa le stesse regole attraverso l'harness e il canale server, conservando bozza e revisioni sul server.

## Tecnologie

Implementati: Next.js, React e TypeScript per interfaccia e backend, Zod per validare dati e input, Vitest per i test. Setup basato sulla [guida ufficiale Next.js](https://nextjs.org/docs/app/getting-started/installation), senza font remoti o servizi esterni richiesti in avvio.

Per la prima integrazione vocale è adottato OpenAI Realtime via WebRTC, con `ws` per il controllo server. LiveKit/STT–LLM–TTS resta un confronto futuro, senza worker o dipendenze aggiunti. Restano previsti Supabase PostgreSQL per le prenotazioni e Playwright per il collaudo del browser.

Il modello e le tariffe vanno verificati sull'account e sulla documentazione ufficiale prima delle prove a pagamento. Il budget di laboratorio proposto nel brief è di **9 USD**, non un credito verificato né una stima sufficiente per un servizio operativo.

## Laboratorio offline dell'agente

Il controller in `src/lib/agent/harness.ts` accetta solo proposte strutturate (`update_draft`, `check_availability`, `prepare_confirmation`, `get_restaurant_info`, `request_human_handoff`) e ne verifica schema e revisione. Lo stesso harness viene usato dal backend vocale. I risultati sono simulati o informativi: **non crea prenotazioni e non conferma operazioni persistenti**. I test documentano casi malevoli senza usare crediti API; l'handoff resta non implementato.

Nuovi documenti: [decisione sulla pipeline vocale](docs/ADR-001-VOICE-PIPELINE.md), [protocollo benchmark voce](docs/VOICE_BENCHMARK.md) e [security evals](docs/AGENT_SECURITY_EVALS.md). La CI esegue lint, typecheck, test e build sulle PR.

## Da dove iniziare

Proseguire con la fase A del [piano di sviluppo](docs/PIANO_DI_SVILUPPO.md), dopo aver verificato account, modello e budget. La preparazione economica della fase 0 resta aperta. Vedi anche lo [stato delle dipendenze di sviluppo](docs/SICUREZZA_E_PRIVACY.md).

Non inserire chiavi API, credenziali, audio reali o dati di clienti nella repository pubblica. Nessuna licenza è stata ancora scelta.
