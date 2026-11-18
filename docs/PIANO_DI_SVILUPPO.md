# Piano di sviluppo

Le caselle indicano lo stato dell'implementazione. Le fasi hanno criteri di uscita; non sono impegni su date o costi già verificati.

## Fase 0 — Preparazione

- [ ] Confermare perimetro e regole demo del [PRD](PRD-agente-segreteria.md).
- [x] Collegare la copia locale alla repository GitHub e verificare lo stato remoto prima di pubblicare.
- [x] Fissare versioni di runtime e dipendenze e conservare il lockfile; lo stato degli avvisi è documentato in sicurezza e privacy.
- [x] Creare lo scheletro Next.js/TypeScript e una configurazione di esempio senza segreti, con esclusioni Git appropriate.
- [ ] Verificare accesso ai servizi, disponibilità del modello e tariffe correnti; assegnare il budget effettivo.
- [x] Implementare dataset fittizio e primo test senza rete delle regole data/turno/coperti.

Lo scheletro include una verifica HTTP di sola lettura, prima delle sessioni vocali. Nessuna integrazione a pagamento è attiva; la fase 0 resta aperta sulla verifica degli account e del budget.

**Uscita:** progetto avviabile localmente con istruzioni ripetibili, dati validati, nessun segreto versionato e nessuna chiamata a pagamento involontaria. Per il codice, prevedere controlli di tipi, lint e test pertinenti eseguibili anche in CI.

## Fase A — Voce nel browser e simulatore

- [ ] Pagina con dichiarazione AI/demo, avvio/arresto accessibili, stato ed errori testuali.
- [ ] Apertura sessione autorizzata con credenziali temporanee, limiti di durata e consumo.
- [ ] Collegamento WebRTC, gestione microfono, interruzioni e rilascio risorse.
- [ ] `get_restaurant_info` con dati approvati e `check_availability` su simulatore deterministico.
- [ ] Controller con raccolta bozza, revisioni, riepilogo e conferma; creazione simulata chiaramente etichettata.
- [ ] Richiesta al personale simulata, senza promettere un trasferimento telefonico.
- [ ] Misura di una sessione breve; valutazione dell'Agents SDK solo se riduce il lavoro necessario.

**Uscita:** una conversazione completa nel browser, una correzione gestita senza usare risultati vecchi, un errore di connessione leggibile e consumi registrati. Nessuna simulazione viene presentata come prenotazione reale.

## Fase B — Prenotazioni persistenti e pannello

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
