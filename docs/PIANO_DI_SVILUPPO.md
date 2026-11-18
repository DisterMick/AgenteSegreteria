# Piano di sviluppo

Le caselle indicano lo stato dell'implementazione. Le fasi hanno criteri di uscita; non sono impegni su date o costi già verificati.

## Fase 0 — Preparazione

- [ ] Confermare perimetro e regole demo del [PRD](PRD-agente-segreteria.md).
- [x] Collegare la copia locale alla repository GitHub e verificare lo stato remoto prima di pubblicare.
- [x] Fissare versioni di runtime e dipendenze e conservare il lockfile; lo stato degli avvisi è documentato in sicurezza e privacy.
- [x] Creare lo scheletro Next.js/TypeScript e una configurazione di esempio senza segreti, con esclusioni Git appropriate.
- [ ] Verificare accesso ai servizi, disponibilità del modello e tariffe correnti; assegnare il budget effettivo.
- [x] Implementare dataset fittizio e primo test senza rete delle regole data/turno/coperti.

L'app include la verifica HTTP di sola lettura e l'integrazione Realtime opzionale. La voce resta disabilitata senza chiave e flag esplicito; la fase 0 resta aperta sulla verifica dell'account e del credito effettivo.

**Uscita:** progetto avviabile localmente con istruzioni ripetibili, dati validati, nessun segreto versionato e nessuna chiamata a pagamento involontaria. Per il codice, prevedere controlli di tipi, lint e test pertinenti eseguibili anche in CI.

## Fase A — Voce nel browser e simulatore

- [x] Introdurre un primo harness **offline** con allowlist delle proposte, validazioni, revisioni e test dei casi malevoli; senza modello né operazioni di scrittura.
- [x] Documentare l'architettura vocale modulare come proposta e definire i protocolli di confronto voce/security.
- [ ] Collegare un modello testuale a un controller **server-side** autenticato e verificare le tool call con test end-to-end; l'harness offline non rappresenta ancora questo traguardo.

- [x] Pagina con dichiarazione AI/demo, avvio/arresto accessibili, stato ed errori testuali.
- [x] Apertura Realtime con chiave solo server, cookie locale e plafond persistente; scambio SDP unificato senza chiave inviata al browser.
- [x] Implementare WebRTC, microfono, VAD con interruzioni e rilascio risorse; validazione audio reale ancora aperta.
- [x] Collegare `get_restaurant_info` e `check_availability` all'harness attraverso il canale server; test con provider simulato.
- [ ] Controller con raccolta bozza, revisioni, riepilogo e conferma; creazione simulata chiaramente etichettata.
- [ ] Richiesta al personale simulata, senza promettere un trasferimento telefonico.
- [x] Eseguire una prima sessione reale breve e registrare connessione, risposta audio, chiusura e costo stimato nel benchmark.
- [ ] Misurare latenza, barge-in, qualità percepita e conversazione vocale completa; valutare l'Agents SDK solo se riduce il lavoro necessario.

La richiesta corrente adotta OpenAI Realtime come prima integrazione. Il modello testuale separato/LiveKit resta uno studio futuro. Test automatici e prima sessione reale disponibili; qualità del barge-in, latenza e intero campione conversazionale restano da misurare. Vedi [VOCE_REALTIME.md](VOCE_REALTIME.md).

**Uscita:** una conversazione completa nel browser, una correzione gestita senza usare risultati vecchi, un errore di connessione leggibile e consumi registrati. Nessuna simulazione viene presentata come prenotazione reale.

## Fase B — Prenotazioni persistenti e pannello

Traguardo locale aggiunto su richiesta: archivio su disco, controllo capienza sotto lock, idempotenza e conferma vocale implementati e verificati offline. Vedi [PRENOTAZIONI_LOCALI.md](PRENOTAZIONI_LOCALI.md). La checklist seguente riguarda database condiviso e pannello; il collaudo audio reale resta aperto.

- [ ] Progettare e versionare schema, migrazioni e seed per i [dati minimi](CONTRATTI_E_DATI.md).
- [ ] Implementare salvataggio transazionale con vincolo tavolo/data/turno e una prenotazione per bozza.
- [ ] Implementare conferme legate alla sessione, idempotenza persistita e riconciliazione dei timeout.
- [ ] Proteggere tabelle e funzioni; verificare assenza di accesso ospite e accesso al pannello solo al personale autorizzato.
- [ ] Pannello con elenco prenotazioni, richieste al personale ed errori essenziali.
- [ ] Sostituire la scrittura simulata con quella persistente e separare le modalità nei messaggi.
- [ ] Testare percorso normale, assenza di conferma, revisione obsoleta, retry, concorrenza, guasti e accessi diretti.

**Uscita:** primo traguardo del README completato; i test degli invarianti DB e delle autorizzazioni passano. Un errore di scrittura non produce una conferma verbale di successo.

## Fase C — Laboratorio di sicurezza e valutazione

- [ ] Implementare tutti gli scenari E01–E20 del [collaudo](COLLAUDO.md).
- [ ] Preparare almeno 20 conversazioni valide con risultati attesi e registrare separatamente gli attacchi.
- [ ] Raccogliere esiti DB, falsi successi, latenza, errori e consumo; mostrare i contatori nel pannello.
- [ ] Verificare gestione dati, cancellazione del dataset e assenza di segreti nei materiali condivisi.
- [ ] Confrontare eventuali modelli alternativi solo se resta budget e sullo stesso campione.
- [ ] Produrre un rapporto con limiti e prove non eseguite dichiarati.

**Uscita:** zero violazioni degli invarianti nei test; almeno 95% di prenotazioni corrette sul campione valido; obiettivo di latenza valutato e scostamenti spiegati; budget riconciliato. Le soglie mancanti richiedono correzioni o una revisione esplicita dei requisiti, non una dichiarazione di completamento.

## Fase D — Telefonia, successiva alla demo

- [ ] Definire uso reale, orari del personale e comportamento se nessuno risponde.
- [ ] Valutare provider SIP, disponibilità, costi di numero/traffico e integrazione con la voce.
- [ ] Definire informativa, protezione dei dati e politica di conservazione per il pilota.
- [ ] Collegare il nuovo canale al controller esistente, mantenendo gli stessi vincoli.
- [ ] Provare disconnessioni, timeout, trasferimento effettivo e costi telefonici aggiuntivi.

**Uscita:** telefonata di prova e handoff realmente verificati, controlli operativi documentati e budget distinto. Nessun numero da acquistare nelle fasi iniziali.

## Decisioni ancora aperte

| Decisione | Quando serve | Impostazione iniziale |
| --- | --- | --- |
| Modello, voce e uso SDK | Fase A | Selezione dopo verifica tecnica ed economica |
| Account Supabase e ambiente locale/hosted | Fase B | Usare solo dati fittizi; nessun progetto creato implicitamente |
| Hosting e accesso demo remoto | Prima della prima pubblicazione dell'app | Locale fino ai controlli di accesso e spesa |
| Licenza del repository | Prima di dichiararne le condizioni di riuso | Nessuna licenza scelta automaticamente |
| Telefono, recapiti e notifiche | Eventuale fase D | Fuori dalla prima versione |

## Manutenzione della documentazione

Il PRD governa il perimetro; contratti e dati governano gli invarianti; il collaudo li verifica. Una modifica a turni, conferme, autorizzazioni o strumenti deve aggiornare i documenti collegati e i relativi test nella stessa modifica. Il README deve continuare a distinguere quanto è implementato da quanto è pianificato.
