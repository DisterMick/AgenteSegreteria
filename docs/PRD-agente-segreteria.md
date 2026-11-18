# PRD — Agente Segreteria

Data: 18 novembre 2026. Stato: proposta iniziale basata sul brief fornito; soglie e assunzioni da validare nel laboratorio.

## 1. Sintesi

Costruire un assistente vocale in italiano per una pizzeria fittizia. Deve rispondere usando dati approvati e gestire nuove prenotazioni senza inventare disponibilità o dichiarare riuscite operazioni fallite. Il primo rilascio è una demo nel browser con database e pannello del personale.

## 2. Referenti

| Referente | Ruolo | Responsabilità |
| --- | --- | --- |
| Michelangelo | Responsabile del progetto | Priorità, account e budget |
| Sviluppo | Implementazione e collaudo | Backend, interfaccia, dati e prove ripetibili |
| Referente del ristorante, da individuare prima di un pilota | Validazione operativa | Orari, menu, allergeni, capienza e procedure |

I ruoli non assegnati non presuppongono persone o accessi già disponibili.

## 3. Contesto

Le richieste ripetitive al telefono possono interrompere il lavoro del personale. Il laboratorio verifica se un agente può raccogliere richieste e completare prenotazioni in modo affidabile, prima di collegare un ristorante reale.

Il valore formativo è nel sistema che governa l'agente: strumenti limitati, vincoli applicativi, gestione degli errori e confronto tra conversazione e risultato nel database. Non ci sono ancora dati di mercato o prove di risparmio operativo.

## 4. Obiettivo e risultati attesi

Entro il completamento della fase B, un cliente deve poter prenotare dal browser e il personale deve vedere il risultato persistito. Entro la fase C, ogni esecuzione del collaudo deve produrre un rapporto confrontabile.

| Risultato | Soglia iniziale proposta | Verifica |
| --- | --- | --- |
| Prenotazioni corrette | Almeno 95% su almeno 20 conversazioni di prenotazione valide | Dettagli richiesti confrontati con database |
| Scritture senza conferma o fuori dai permessi | Zero nei casi del collaudo | Chiamate agli strumenti e stato finale |
| Duplicati e sovraprenotazioni | Zero nei test ripetuti e concorrenti | Conteggio righe e vincoli DB |
| Conferme verbali prive di prenotazione | Zero nei casi osservati | Risposta confrontata con esito persistito |
| Risposta vocale | p95 entro 2,5 secondi, obiettivo da misurare | Fine turno utente → primo audio utile; attese strumenti separate |
| Spesa | Consumi misurati e prove entro il budget assegnato | Uso provider, stime e riconciliazione |

Le soglie sono obiettivi, non risultati acquisiti. Un insieme limitato di prove non dimostra sicurezza generale. Definizioni e campioni sono nel [collaudo](COLLAUDO.md).

## 5. Utenti e bisogni

| Utente | Bisogno | Limite del laboratorio |
| --- | --- | --- |
| Cliente | Sapere se il locale può accoglierlo e prenotare senza ambiguità | Italiano, un solo ristorante, dati fittizi |
| Personale | Ricevere prenotazioni attendibili e richieste da gestire | Consultazione e handoff simulato |
| Responsabile del progetto | Misurare qualità, errori, sicurezza e costi | Nessun servizio operativo continuativo |

## 6. Valore proposto

Il cliente riceve un riepilogo comprensibile e una risposta coerente con la disponibilità effettiva. Il personale trova una prenotazione completa invece di una promessa dell'agente. Chi sviluppa può ricostruire errori e verificare se una modifica migliora i risultati.

Il beneficio rispetto alla gestione manuale è un'ipotesi da verificare con un futuro pilota. Non si assumono vantaggi dimostrati rispetto a prodotti concorrenti.

## 7. Soluzione

### 7.1 Esperienza prevista

1. La pagina dichiara che si tratta di un assistente AI di un ristorante fittizio.
2. Il cliente avvia la chiamata e autorizza il microfono; può terminarla in qualsiasi momento.
3. L'agente si presenta, chiarisce richieste ambigue e raccoglie data, ora e coperti.
4. Il backend verifica la disponibilità. Un risultato precedente non vale dopo una correzione.
5. L'agente raccoglie il nome e riepiloga data, ora, coperti e nome.
6. Il cliente conferma esplicitamente. Il backend ricontrolla i vincoli e tenta il salvataggio atomico.
7. Solo dopo il successo persistito l'agente comunica codice e dettagli. In caso di errore propone alternative o intervento umano.

La pagina mostra stato della chiamata, riepilogo e messaggi di errore anche in forma testuale. Avvio e arresto sono accessibili da tastiera. Un eventuale pannello di debug con trascrizioni è riservato al laboratorio e resta fuori dai log persistenti.

### 7.2 Requisiti funzionali

| ID | Requisito | Accettazione |
| --- | --- | --- |
| RF-01 | Voce italiana, pause e interruzioni | Un'interruzione ferma l'audio in uscita; una correzione aggiorna la bozza |
| RF-02 | Informazioni verificate | Risposte ricavate dai dati approvati; dati assenti dichiarati come sconosciuti |
| RF-03 | Disponibilità | Data, ora, coperti e fuso validati dal server |
| RF-04 | Prenotazione confermata | Riepilogo esplicito e conferma riferita alla versione corrente |
| RF-05 | Integrità | Un retry non crea duplicati; due richieste non occupano lo stesso tavolo/turno |
| RF-06 | Recupero e handoff | Dopo due chiarimenti senza successo, o su richiesta, registra la richiesta al personale |
| RF-07 | Pannello personale | Utente autorizzato consulta prenotazioni ed errori; ospite senza accesso |
| RF-08 | Osservabilità | Sessione, operazioni, esiti, latenza e consumi correlabili senza segreti o trascrizioni integrali |

### 7.3 Tecnologia

Stack proposto e confini di responsabilità sono nell'[architettura](ARCHITETTURA.md). Strumenti e modello dati sono in [contratti e dati](CONTRATTI_E_DATI.md). Non è previsto un agente con accesso SQL libero.

### 7.4 Assunzioni da verificare

- Un solo tavolo per prenotazione e turni fissi sono sufficienti per la demo.
- La disponibilità effettiva di un modello vocale economico e la latenza sono compatibili con account e rete di test.
- I 9 USD citati nel brief sono un tetto di pianificazione da confermare prima dei consumi.
- Il nome è sufficiente nel laboratorio; recapiti, notifiche e riconoscimento dei clienti sono rinviati.
- Comprendere una conferma vocale resta fallibile: ambiguità e correzioni devono portare a nuova richiesta di conferma.

### 7.5 Esclusioni

Niente pagamenti, modifiche o cancellazioni di prenotazioni esistenti, elenchi di prenotazioni esposti al cliente, consulenza sanitaria sugli allergeni, gestionali commerciali, più locali o numero telefonico nella demo iniziale.

## 8. Rilascio

Sviluppo per traguardi: preparazione → voce nel browser con simulatore → database e pannello protetto → collaudo avversariale → eventuale telefonia. Ogni fase richiede l'esito della precedente; non si fissano date prima del setup e delle prime misure.

La demo è conclusa quando le fasi A, B e C soddisfano i criteri del [piano di sviluppo](PIANO_DI_SVILUPPO.md). La telefonia è un'estensione successiva. Un pilota con clienti reali richiede una nuova verifica operativa, economica e di protezione dei dati.
