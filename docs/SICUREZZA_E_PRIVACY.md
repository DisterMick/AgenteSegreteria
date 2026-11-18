# Sicurezza e privacy — requisiti del laboratorio

Questi sono requisiti da implementare e verificare. Non descrivono controlli già attivi né attestano conformità per un servizio reale.

## Stato delle dipendenze dello scheletro

Il 18 novembre 2026 `npm audit` segnala una vulnerabilità di esaurimento delle risorse in `picomatch`, dipendenza transitiva degli strumenti di sviluppo e test. L'[avviso GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) non indica una versione corretta disponibile. Gli avvisi propagati ai pacchetti che lo usano non rappresentano vulnerabilità indipendenti.

Questi strumenti operano sui file del progetto; la verifica di disponibilità non accetta pattern glob dal chiamante. Non esporre server di sviluppo o runner di test in rete e non eseguire tooling su repository non attendibili. Ricontrollare l'avviso al prossimo aggiornamento; non forzare downgrade del framework o override incompatibili per azzerare il conteggio. Verificare separatamente le dipendenze runtime con `npm audit --omit=dev`.

ESLint 10 evita di adottare la serie 9 fuori supporto. Alcuni plugin inclusi nella configurazione Next.js dichiarano ancora compatibilità fino a ESLint 9: npm emette avvisi sui peer durante l'installazione. Installazione e lint vanno verificati insieme; aggiornare la configurazione appena i plugin dichiareranno supporto ufficiale.

## Confini di fiducia

| Origine del rischio | Controllo richiesto | Evidenza di collaudo |
| --- | --- | --- |
| Il chiamante si dichiara proprietario | Nessun cambio di ruolo dalla conversazione | Nessun accesso amministrativo o scrittura fuori perimetro |
| Il menu contiene istruzioni malevole | Contenuti trattati come dati; strumenti con permessi fissi | Nessuna esecuzione di istruzioni incluse nel documento |
| Il client invoca direttamente un endpoint | Validazione, sessione e autorizzazione sul backend | Richiesta forgiata rifiutata anche senza modello |
| Due clienti vogliono l'ultimo tavolo | Operazione atomica e vincolo DB | Una sola prenotazione |
| Retry o timeout dopo commit | Chiave idempotente persistita e riconciliazione | Nessun duplicato o falso successo |
| Richiesta di dati di altri clienti | Nessuno strumento per elencarli; pannello riservato | Nessuna informazione personale nella risposta |
| Furto o abuso di sessioni | Credenziali brevi, limiti d'accesso e consumo | Sessioni scadute o non autorizzate rifiutate |

Il primo caso è manipolazione diretta del comportamento; il secondo è prompt injection indiretta. Un rifiuto verbale non basta: si controllano chiamate agli strumenti e database.

## Segreti e accessi

- Chiavi OpenAI permanenti e chiavi segrete Supabase solo sul server; mai variabili pubbliche, bundle browser, log o Git.
- Prima di inserire credenziali nel setup, creare esclusioni Git per file locali e un esempio di configurazione con soli segnaposto.
- Sessione demo richiesta anche per gli endpoint di emissione credenziali vocali e strumenti; limiti a frequenza e sessioni simultanee.
- Il pannello richiede autenticazione e un'autorizzazione al ruolo del personale assegnata sul server. Il semplice login non dà diritto a vedere prenotazioni.
- Le tabelle esposte richiedono RLS e permessi minimi; quelle interne non devono essere accessibili al chiamante. Verificare anche i privilegi sulle funzioni DB.
- Non considerare sufficiente RLS quando si usa un accesso server privilegiato che la bypassa: le restrizioni applicative restano necessarie. Vedi [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Nessun endpoint amministrativo viene esposto come strumento al modello.

## Dati personali e trasparenza

La demo usa nomi e conversazioni inventati. Pagina e saluto vocale dichiarano che l'interlocutore è un assistente AI e che il ristorante è fittizio.

Audio e trascrizioni integrali non vengono salvati dall'app per impostazione iniziale; l'elaborazione audio da parte del provider resta necessaria e va spiegata. Verificare le impostazioni e le condizioni dei fornitori prima di trattare dati reali: non si presume assenza di conservazione esterna.

Il database raccoglie solo il nome necessario alla prenotazione, data, turno, coperti e riferimenti tecnici. Niente carte di pagamento, diagnosi, dettagli di salute o note libere sui clienti. Il pannello e le tracce non devono esporre più dati del necessario.

Politica proposta per i dati fittizi del laboratorio: prenotazioni eliminate al reset del dataset; eventi tecnici conservati al massimo sette giorni; stato conversazionale eliminato alla fine della sessione. Le prove con commit in dubbio vanno prima riconciliate. Nessuna di queste durate è proposta come obbligo legale o politica per un ristorante reale.

Prima di un pilota reale definire informativa, finalità, basi del trattamento, ruoli dei fornitori, conservazione e cancellazione, gestione dei diritti e accessi del personale. Registrazione delle chiamate e telefonia richiedono una valutazione specifica. Questo progetto iniziale non costituisce una valutazione legale.

## Budget e contenimento dei consumi

Valori iniziali proposti, da confermare prima delle prove a pagamento:

| Limite | Valore |
| --- | --- |
| Budget complessivo laboratorio | 9 USD, disponibilità effettiva da verificare |
| Budget giornaliero | 1 USD |
| Budget per sessione | 0,50 USD |
| Durata massima sessione | 3 minuti |
| Sessioni vocali simultanee | 1 |

Il backend deve verificare il budget prima di aprire una sessione, riservare margine per il consumo in corso e aggiornare il totale con i dati d'uso disponibili. La pagina mostra la stima e distingue i costi non ancora riconciliati. Al limite interrompere nuove sessioni e chiudere la connessione vocale; riaprire la pagina non azzera i contatori persistiti.

Le soglie applicative non garantiscono un tetto contabile esatto: ritardi di rendicontazione e consumo già avviato possono causare scostamenti. Impostare anche i controlli disponibili sull'account provider, verificandone l'effettivo comportamento. Nessuna tariffa fissa è assunta da questo documento.

## Se una prova fallisce

Sospendere le nuove sessioni se emergono esposizioni di dati, scritture non autorizzate o consumo inatteso. Conservare soltanto evidenze tecniche anonimizzate, correggere la causa e rieseguire i casi interessati. Se un segreto è stato pubblicato, revocarlo e sostituirlo: cancellare il file non è sufficiente.
