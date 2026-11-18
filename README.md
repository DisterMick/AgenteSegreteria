# Agente Segreteria

Receptionist AI vocale in italiano per un ristorante: risponde alle domande, verifica i tavoli disponibili e crea prenotazioni dopo la conferma del cliente.

**Stato al 18 novembre 2026:** definizione del progetto. Questa repository contiene la documentazione iniziale; applicazione, database e integrazioni non sono ancora implementati. Non ci sono comandi di avvio da eseguire.

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

## Tecnologie proposte

Next.js e TypeScript per interfaccia e backend; OpenAI Realtime via WebRTC per la voce; Supabase PostgreSQL per le prenotazioni; Zod per validare gli input; Vitest e Playwright per il collaudo. Le dipendenze verranno scelte e fissate durante il setup. L'Agents SDK è un candidato da valutare, non un requisito già adottato.

Il modello e le tariffe vanno verificati sull'account e sulla documentazione ufficiale prima delle prove a pagamento. Il budget di laboratorio proposto nel brief è di **9 USD**, non un credito verificato né una stima sufficiente per un servizio operativo.

## Da dove iniziare

Seguire la fase 0 del [piano di sviluppo](docs/PIANO_DI_SVILUPPO.md), poi implementare la demo locale con dati fittizi. Le prime prove di logica devono funzionare anche senza chiamate a servizi a pagamento.

Non inserire chiavi API, credenziali, audio reali o dati di clienti nella repository pubblica. Nessuna licenza è stata ancora scelta.
