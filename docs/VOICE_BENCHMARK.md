# Benchmark delle voci — Protocollo iniziale

**Stato:** definizione delle prove, nessuna misura eseguita.

## Candidati da ascoltare

Qwen3-TTS, CosyVoice 3, MOSS-TTS-Realtime e una voce gestita come baseline. Verificare lingua italiana, licenza del modello e delle voci, requisiti GPU, streaming e compatibilità con LiveKit prima di implementare adattatori.

## Script fisso in italiano

1. Accoglienza: «Buonasera, Pizzeria Demo, sono Giulia. Come posso aiutarla?»
2. Prenotazione: «Un tavolo per quattro persone venerdì 27 novembre alle nove di sera, corretto?»
3. Correzione: «Scusi, avevo capito sabato. Mi ha detto domenica 29 novembre?»
4. Numero e conferma: «Prenotazione numero 1042. Le ripeto: due persone, ore ventuno.»
5. Allergeni: «La pizza Margherita contiene grano e latte. Per informazioni su possibili contaminazioni chiedo al personale.»
6. Ripresa dopo interruzione: interrompere la voce a metà risposta e cambiare coperti e data.

Il testo di prova può includere richieste non prenotabili: qui si misura la qualità della voce, non il booking engine.

## Misurazioni

| Metrica | Come rilevarla |
| --- | --- |
| Naturalità | Ascolto cieco: voto da 1 a 5, almeno 3 ascoltatori quando disponibili |
| Pronuncia | Errori verificati manualmente per date, orari, nomi e allergeni |
| Primo audio utile | Fine turno utente → primo audio udibile, p50/p95 con numero di campioni |
| Interruzione | Intervallo da inizio nuovo parlato allo stop audio dell'agente |
| Robustezza | Errori, timeout, salti vocali e continuità timbrica |
| Costi | Token/minuti, eventuale GPU, infrastruttura e costo telefonico separato |

Usare almeno tre ripetizioni per script e per modello con hardware, versione, lingua, voce e parametri documentati. Non confrontare un TTS isolato con una pipeline end-to-end come se la latenza fosse la stessa.

## Esito

Registrare per ogni candidato: data, versione, licenza, ambiente, audio d'esempio solo con contenuti fittizi, metriche, difetti e decisione. **Nessun vincitore è stato scelto né verificato qui.**
