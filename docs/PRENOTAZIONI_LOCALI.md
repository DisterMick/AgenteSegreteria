# Prenotazioni locali della pizzeria demo

Scelta dell'utilizzatore: archivio persistente sul computer, senza nuovi servizi. Nessuna prenotazione riguarda un ristorante reale.

## Percorso

1. Il cliente parla per primo. Con data, ora e coperti già chiari, l'agente verifica subito i tavoli.
2. Se disponibile, chiede il nome e prepara il riepilogo completo. Non richiede recapiti.
3. Il controller verifica che la trascrizione della domanda coincida con il riepilogo generato e che il provider segnali il termine della riproduzione audio. Un'interruzione non abilita la conferma.
4. Solo un nuovo turno audio con un assenso breve e inequivocabile («Sì», «Sì, confermo», «Va bene») può confermare la revisione corrente entro due minuti. «Sì, ma alle 19», rifiuti, silenzio e trascrizioni fuori ordine non salvano. Altre formulazioni richiedono un nuovo riepilogo.
5. Il server ricontrolla capienza e orario e salva. L'agente può annunciare successo solo dopo `RESERVATION_SAVED`, comunicando il campo `code`. La pagina mostra lo stesso esito durante la chiamata.

La trascrizione ASR è fallibile: questi controlli riducono conferme improprie, non provano con certezza l'intenzione. Audio e trascrizioni restano transitori; non sono registrati dall'app.

## Archivio e recupero

Il file `.local/reservations.json` viene creato al primo salvataggio. Contiene UUID, tavolo, data e turno locali, coperti, nome, creazione UTC e riferimento tecnico sessione/revisione. Il codice pubblico sono i primi otto caratteri dell'UUID; non autorizza letture o modifiche. `.local/` è esclusa da Git: non pubblicarla e usa solo nomi fittizi.

Il file sopravvive a riavvii e ricaricamenti. Ogni scrittura usa lock esclusivo e sostituzione atomica: ricontrolla i posti sotto lock, assegna il tavolo libero idoneo più piccolo e registra una sola riga per sessione/revisione. Un retry identico restituisce la stessa riga; stessi identificativi con dettagli diversi producono conflitto. Disponibilità HTTP e vocale leggono lo stesso archivio senza esporre altre prenotazioni.

File corrotto, disco non scrivibile o lock occupato impediscono il salvataggio; nessun falso successo. Dopo un arresto improvviso, un lock residuo richiede verifica a processo fermo. Non cancellare `.local/` per risolvere un errore: contiene anche il ledger del budget.

Limiti: un disco locale e un server, nessun pannello elenco, cancellazione, autenticazione remota o backup automatico. Prima di hosting, repliche o dati reali servono database condiviso, accessi e politica di conservazione. Le bozze non confermate restano in memoria e si perdono al riavvio.

## Verifica del 18 novembre 2026

Test offline: percorso voce/strumenti/conferma/file, mancata conferma, riepilogo interrotto o diverso, correzioni, scadenza, replay, ASR fuori ordine, duplicati, ultimo tavolo, guasti e riservatezza degli output. Nessun credito API consumato per questa modifica. Il nuovo flusso non è ancora provato con audio reale.
