# ADR-001 — Pipeline vocale modulare

**Stato:** proposta conservata per confronti futuri; superata per la prima integrazione dalla richiesta di usare OpenAI Realtime. **Data:** 18 novembre 2026. L'implementazione adottata è descritta in [VOCE_REALTIME.md](VOCE_REALTIME.md); non è stato installato un worker LiveKit e nessun benchmark comparativo è stato concluso.

## Contesto

Il laboratorio deve parlare italiano naturale, tollerare interruzioni e permettere un confronto tra voci open source (Qwen3-TTS, CosyVoice, MOSS-TTS) e alternative gestite. Una pipeline collegata direttamente a un solo provider speech-to-speech rende meno semplice sostituire la voce e isolare gli errori.

## Decisione

Preferire come prima integrazione una pipeline **STT → LLM → TTS** con un worker vocale LiveKit Agents separato dal dominio prenotazioni Next.js. Le chiamate agli strumenti passano da un backend autorizzato. La pipeline resta una proposta finché non saranno misurati costi, latenza, compatibilità e risorse locali.

- **Browser:** microfono, riproduzione audio, stato conversazione, interruzioni; nessun segreto API ordinario.
- **Voice worker:** gestione turni, VAD/STT, chiamate al modello testuale e TTS. Interrompe l'audio quando il cliente riprende a parlare.
- **Adapter STT/LLM/TTS:** identificatori e configurazioni esplicite. Un TTS open source può richiedere un servizio locale/remoto dedicato; **non** assumere che esista già un plugin LiveKit per Qwen/CosyVoice.
- **Backend Next.js:** unico punto di policy e tool execution. Non esegue SQL libero chiesto dal modello.
- **Booking engine:** conferme, regole, transazioni, idempotenza e autorizzazioni lato server/database.

## Cosa non decidiamo ancora

- Il modello TTS definitivo, la disponibilità di una GPU, un hosting GPU o i costi del provider.
- Il fornitore STT e LLM definitivo.
- La scelta fra worker LiveKit Node.js e Python: il progetto principale resta TypeScript e il componente vocale potrà essere separato.
- La telefonia SIP: solo dopo test nel browser e controlli di sicurezza.
- Eventuali registrazioni audio: la demo non conserva audio per impostazione iniziale.

## Alternative

| Alternativa | Vantaggio | Rischio |
| --- | --- | --- |
| STT → LLM → TTS / LiveKit | Voci intercambiabili; trascrizione e controllo espliciti | Più passaggi e latenza da ottimizzare |
| OpenAI Realtime | Minor numero di componenti | Voce vincolata al provider; minore visibilità su alcuni passaggi |
| Pipeline artigianale WebSocket | Massimo controllo | Complessità elevata su VAD, streaming, interruzioni e riconnessioni |

**Criterio di accettazione:** valutare le tre opzioni con gli stessi scenari del file [VOICE_BENCHMARK.md](VOICE_BENCHMARK.md). Nessuna scelta definitiva basata unicamente su clip pubblicitarie.

Riferimenti: [LiveKit — Pipeline types](https://docs.livekit.io/agents/models/pipelines/), [LiveKit — Pipeline nodes and hooks](https://docs.livekit.io/agents/logic/nodes/), [OpenAI — Function calling](https://developers.openai.com/api/docs/guides/function-calling).
