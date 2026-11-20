# Prenotazioni locali della pizzeria demo

Scelta dell'utilizzatore: archivio persistente sul computer, senza nuovi servizi. Nessuna prenotazione riguarda un ristorante reale.

## Percorso

1. Il cliente parla per primo. Con data, ora e coperti già chiari, l'agente verifica subito i tavoli.
2. Se disponibile, chiede il nome e prepara il riepilogo completo. Non richiede recapiti.
3. Il controller verifica la domanda contro varianti equivalenti con numeri in cifre o in lettere e attende la fine audio. Accetta il riscontro del canale server o del browser proprietario solo per il riepilogo noto; un'interruzione resta bloccante. La conferma preparata sopravvive al diverso ordine di arrivo degli eventi.
4. Solo un nuovo turno audio con assenso inequivocabile («Sì», «Sì, esatto», «Sì, ti confermo», «Confermo la prenotazione») può confermare la revisione corrente entro due minuti. «Sì, ma alle 19» richiede correzione e nuovo controllo; rifiuti, silenzio e trascrizioni fuori ordine non salvano. Dopo due tentativi falliti lo stesso riepilogo è bloccato, senza richieste infinite di conferma.
5. Il server ricontrolla capienza e orario e salva. L'agente può annunciare successo solo dopo `RESERVATION_SAVED`, comunicando il campo `code`. Alla chiusura e dopo un aggiornamento della pagina, lo stesso browser può rileggere la ricevuta dal disco con il cookie HttpOnly della chiamata. Il cookie scade un’ora dopo l’avvio e viene sostituito alla chiamata successiva.

La trascrizione ASR è fallibile: questi controlli riducono conferme improprie, non provano con certezza l'intenzione. Audio e trascrizioni restano transitori; non sono registrati dall'app.

## Archivio e recupero

Il file `.local/reservations.json` viene creato al primo salvataggio. Contiene UUID, tavolo, data e turno locali, coperti, nome, creazione UTC e riferimento tecnico sessione/revisione. Il codice pubblico sono i primi otto caratteri dell'UUID; non autorizza letture o modifiche. `.local/` è esclusa da Git: non pubblicarla e usa solo nomi fittizi.

Il file sopravvive a riavvii e ricaricamenti. Ogni scrittura usa lock esclusivo e sostituzione atomica: ricontrolla i posti sotto lock, assegna il tavolo libero idoneo più piccolo e registra una sola prenotazione per chiamata, anche se cambia la revisione. Un retry identico restituisce la stessa riga; stessi identificativi con dettagli diversi producono conflitto. Disponibilità HTTP e vocale leggono lo stesso archivio senza esporre altre prenotazioni.

File corrotto, disco non scrivibile o lock occupato impediscono il salvataggio; nessun falso successo. Dopo un arresto improvviso, un lock residuo richiede verifica a processo fermo. Non cancellare `.local/` per risolvere un errore: contiene anche il ledger del budget.

Limiti: un disco locale e un server, nessun pannello elenco, cancellazione, autenticazione remota o backup automatico. Prima di hosting, repliche o dati reali servono database condiviso, accessi e politica di conservazione. Le bozze non confermate restano in memoria e si perdono al riavvio.

## Verifica del 18 novembre 2026

La prova reale ha evidenziato un ciclo di conferma senza alcun file salvato. Corrette e riprodotte offline: perdita della conferma quando l'inizio del sì precede la fine audio, equivalenza dei numeri pronunciati e assensi naturali. Coperti anche rifiuti, correzioni, scadenza, replay, ACK estranei/tardivi, ASR fuori ordine, duplicati, ultimo tavolo, guasti e privacy dei log. Nessun credito API consumato per queste correzioni. Il nuovo modello e il flusso corretto richiedono ancora la prova audio reale.
