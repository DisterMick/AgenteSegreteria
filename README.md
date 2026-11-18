# Agente Segreteria

Receptionist AI vocale in italiano per un ristorante: risponde alle domande, verifica i tavoli disponibili e crea prenotazioni dopo la conferma del cliente.

**Stato al 18 novembre 2026:** scheletro locale Next.js/TypeScript con disponibilità simulata e primo harness testuale deterministico (solo codice e test, nessuna interfaccia di chat). Voce, LLM, salvataggio prenotazioni, autenticazione e database non sono ancora implementati.

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

Aprire [http://127.0.0.1:3000](http://127.0.0.1:3000). Non servono chiavi API né un file `.env`; `.env.example` documenta questa scelta. Avvio e prove non chiamano servizi AI o database e non generano consumi API.

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
| `*.test.ts` | Prove deterministiche delle regole e del confine HTTP |

`POST /api/availability` accetta soltanto `{ "date": "YYYY-MM-DD", "time": "HH:mm", "party_size": 2 }`. Risponde con `status: "available"`, dettagli, conteggio tavoli idonei e `simulated: true`, oppure HTTP 400 con `status: "invalid"` e un messaggio. Non è ancora lo strumento vocale `check_availability`: sessioni e revisioni verranno aggiunte con il controller della fase A.

## Tecnologie

Implementati: Next.js, React e TypeScript per interfaccia e backend, Zod per validare dati e input, Vitest per i test. Setup basato sulla [guida ufficiale Next.js](https://nextjs.org/docs/app/getting-started/installation), senza font remoti o servizi esterni richiesti in avvio.

Previsti: pipeline STT–LLM–TTS modulare con LiveKit Agents (da validare), Supabase PostgreSQL per le prenotazioni e Playwright per il collaudo del browser. OpenAI Realtime resta un'alternativa da misurare; nessuna dipendenza vocale è stata installata.

Il modello e le tariffe vanno verificati sull'account e sulla documentazione ufficiale prima delle prove a pagamento. Il budget di laboratorio proposto nel brief è di **9 USD**, non un credito verificato né una stima sufficiente per un servizio operativo.

## Laboratorio offline dell'agente

Il controller in `src/lib/agent/harness.ts` accetta solo proposte strutturate (`update_draft`, `check_availability`, `prepare_confirmation`, `get_restaurant_info`, `request_human_handoff`) e ne verifica schema e revisione. I risultati sono simulati o informativi: **non crea prenotazioni e non conferma operazioni persistenti**. I test documentano casi malevoli senza usare crediti API.

Nuovi documenti: [decisione sulla pipeline vocale](docs/ADR-001-VOICE-PIPELINE.md), [protocollo benchmark voce](docs/VOICE_BENCHMARK.md) e [security evals](docs/AGENT_SECURITY_EVALS.md). La CI esegue lint, typecheck, test e build sulle PR.

## Da dove iniziare

Proseguire con la fase A del [piano di sviluppo](docs/PIANO_DI_SVILUPPO.md), dopo aver verificato account, modello e budget. La preparazione economica della fase 0 resta aperta. Vedi anche lo [stato delle dipendenze di sviluppo](docs/SICUREZZA_E_PRIVACY.md).

Non inserire chiavi API, credenziali, audio reali o dati di clienti nella repository pubblica. Nessuna licenza è stata ancora scelta.
