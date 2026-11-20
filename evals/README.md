# Scenari di valutazione

Copioni per verificare l'agente in modo ripetibile. Ogni scenario descrive **chi chiama, cosa vuole e cosa deve risultare alla fine**. Il risultato si verifica soprattutto sul database e sul registro degli strumenti, non su come l'agente formula le frasi.

## File

| File | Contenuto | Collaudo |
| --- | --- | --- |
| `scenarios/prenotazioni-valide.yaml` | 20 prenotazioni che devono riuscire (denominatore del 95%) | E01, E03, E05, E06 |
| `scenarios/regole-e-conferma.yaml` | Richieste da respingere e conferme mancate | E02, E04, E06 |
| `scenarios/info-e-handoff.yaml` | Domande sul locale, allergeni, richiesta di una persona | E16, E17 |
| `scenarios/attacchi.yaml` | Manipolazione, prompt injection, richiesta di dati altrui | E12, E13, E15 |
| `scenarios/guasti-e-sistema.yaml` | Database giù, timeout, concorrenza (test di sistema, non conversazionali) | E07–E11 |
| `scenarios/telefono.yaml` | Comportamenti specifici della chiamata telefonica (fase D) | AI Act, handoff |

I casi E14 (accesso al pannello), E18 (microfono/risorse), E19 (budget) ed E20 (segreti nei log) si verificano con test di integrazione o end-to-end, non con conversazioni.

## Formato

```yaml
- id: V01                      # univoco, mai riusato
  title: Richiesta completa in una frase
  tags: [prenotazione, base]
  covers: [E01, RF-03, RF-04]
  tenant: pizzeria-demo
  clock: "2026-11-18T16:00:00+01:00"   # mercoledì; tutte le date relative partono da qui
  setup:                       # stato del DB prima della chiamata (opzionale)
    occupied: [{ resource: T3, date: "2026-11-21", time: "19:00" }]
    faults: []                 # db_down_before_write | timeout_after_commit
  caller:
    persona: chi è e come parla
    goal: cosa vuole ottenere
    says:                      # battute guida: il simulatore può parafrasarle
      - "..."
    knows: { name: Rossi }     # cosa risponde se gli viene chiesto
    behavior: [regole per il simulatore]
    audio: { noise: kitchen, pace: fast, accent: siciliano }   # solo per le varianti vocali
  expect:
    reservations:              # nuove righe della sessione, oltre ai dati iniziali
      - { date: "2026-11-19", time: "19:00", party_size: 2, name: Rossi }
    handoff: null              # oppure il motivo atteso
    events_must_not: [RESERVATION_SAVED]   # opzionale: codici del controller che non devono comparire
    must: [concetti che l'agente deve esprimere]
    must_not: [cose che non deve mai dire o fare]
    max_turns: 12
```

## Rapporto con il codice attuale

- **`evals/prenotazione.test.ts` resta il livello 1:** azioni scritte a mano sul `BookingController`, senza LLM. Questi YAML sono il livello 2: un LLM fa da cliente e l'agente vero decide cosa fare. Gli ID non si sovrappongono (`E01`… lì, `V01`/`R01`/`A01`… qui) e `covers` collega i due livelli.
- **Strumento del modello:** c'è un solo strumento, `restaurant_action`, con `type` tra `update_draft`, `check_availability`, `prepare_confirmation`, `get_restaurant_info` e `request_human_handoff`. Il modello non ha una `create_reservation`: il salvataggio lo fa il controller dopo il riepilogo riprodotto e un nuovo turno di assenso. Gli scenari controllano quindi i codici di esito (`RESERVATION_SAVED`, `USER_DECLINED`, `AMBIGUOUS_REPLY`, `SAVE_FAILED`…) e l'archivio `.local/reservations.json`, tramite la classe `Reservations` in una cartella temporanea.
- **Conferma in modalità testo:** il runner deve imitare la sequenza audio del controller. Dopo il riepilogo chiama `summaryDelivered(testo, true, true)`, poi apre ogni risposta del cliente con `beginTurn` e la chiude con `finishTurn(turno, testo, clock)`.
- **`setup.occupied`** si traduce in `archive.save(...)` prima della chiamata. **`setup.faults`** si ottiene con un archivio che fallisce (`SAVE_FAILED`) o che fa commit e poi va in timeout.
- **Handoff:** oggi risponde `HANDOFF_NOT_IMPLEMENTED`. Gli scenari con `handoff:` atteso (I04, I05, I06, T02) vanno riportati come **non eseguibili** finché non è implementato, non come falliti.
- **Assensi naturali.** Il controller riconosce anche «ok», «certo, grazie» e «esatto, perfetto». V19 verifica che a un assenso ambiguo segua un chiarimento.

## Come deve funzionare il runner

1. Carica il locale (`tenant`), fissa l'orologio (`clock`) e prepara il DB (`setup`) in un ambiente pulito.
2. Un LLM in modalità testo interpreta il **cliente simulato** usando `persona`, `goal`, `says`, `knows` e `behavior`. Non deve mai vedere `expect`.
3. Il cliente parla con il controller vero e i suoi strumenti veri. Il modello vocale non serve: queste prove sono economiche e si possono ripetere a ogni PR.
4. A fine conversazione i controlli sono di due tipi:
   - **deterministici, e decidono l'esito:** `reservations`, `handoff`, `events_must`, `events_must_not`, `max_turns`, confrontati con il DB e con il registro degli strumenti;
   - **semantici, con un LLM giudice:** `must` e `must_not` sulla trascrizione. Servono come segnale aggiuntivo: da soli non fanno passare un caso.
5. Il rapporto riporta ID, esito, turni, strumenti chiamati e costo. Non salva nomi reali, perché qui sono tutti inventati.

**Varianti vocali.** Per le prove con la voce, le battute del cliente si sintetizzano con un TTS italiano applicando `audio` (rumore di cucina, ritmo, accento). Il resto non cambia. Vanno registrate a parte rispetto alle prove testuali (vedi COLLAUDO.md).

**Ripetizioni.** Gli LLM non sono deterministici. Esegui ogni scenario valido almeno 3 volte e riporta la percentuale, non solo "passato".

## Calendario di riferimento (clock mercoledì 18/11/2026, 16:00)

| Espressione | Data |
| --- | --- |
| stasera | mer 18/11 |
| domani | gio 19/11 |
| venerdì | ven 20/11 |
| sabato | sab 21/11 |
| domenica | dom 22/11 |
| lunedì | lun 23/11 — **chiuso** |
| il 27 | ven 27/11 |
| ultimo giorno prenotabile | ven 18/12 |
