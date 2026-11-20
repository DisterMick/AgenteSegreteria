import { playbackSchema, realtimeVoice } from "@/lib/voice/service";
import { selectionSchema, voicePolicy } from "@/lib/voice/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookieName = "pizzeria_voice";
const headers = { "Cache-Control": "no-store" };
const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
const messages: Record<string, string> = {
  VOICE_NOT_CONFIGURED: "Configura OPENAI_API_KEY e OPENAI_REALTIME_ENABLED nel file .env.local.",
  VOICE_PAUSED: "Prove vocali in pausa durante le correzioni. Nessun credito viene consumato.",
  CALL_ACTIVE: "Una chiamata è già attiva o in attesa di riconciliazione.",
  DAILY_BUDGET: "Plafond giornaliero esaurito.", TOTAL_BUDGET: "Plafond complessivo esaurito.",
  SESSION_NOT_FOUND: "La sessione non è autorizzata.",
  CLOSE_PENDING: "Chiusura non ancora confermata da OpenAI. Nuove chiamate bloccate; riprova Termina.",
  OPENAI_ACCESS_DENIED: "Chiave OpenAI non valida oppure accesso al modello non autorizzato. Verifica il progetto API.",
  OPENAI_QUOTA_OR_RATE_LIMIT: "Credito, quota o frequenza OpenAI non disponibili. Verifica l’account prima di riprovare.",
};

function allowed(request: Request) {
  try {
    const url = new URL(request.url);
    const host = new URL(`${url.protocol}//${request.headers.get("Host") ?? url.host}`);
    if (!localHosts.has(url.hostname) || !localHosts.has(host.hostname) || request.headers.get("Sec-Fetch-Site") === "cross-site") return false;
    const origin = request.headers.get("Origin");
    return (request.method === "GET" && !origin) || origin === host.origin;
  } catch { return false; }
}
function owner(request: Request) {
  return request.headers.get("Cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return Response.json({ message: messages[code] ?? "Servizio vocale non disponibile. Controlla configurazione e stato del budget; nessun dettaglio riservato è stato esposto." }, { status: code === "SESSION_NOT_FOUND" ? 403 : 503, headers });
}

export async function GET(request: Request) {
  if (!allowed(request)) return Response.json({ message: "La demo vocale è disponibile soltanto in locale." }, { status: 403, headers });
  try { return Response.json(await realtimeVoice.status(owner(request)), { headers }); } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!allowed(request)) return Response.json({ message: "Origine non autorizzata." }, { status: 403, headers });
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/sdp") return Response.json({ message: "Invia una SDP valida." }, { status: 400, headers });
  const selection = selectionSchema.safeParse({
    model: request.headers.get("X-Realtime-Model") ?? voicePolicy.model,
    voice: request.headers.get("X-Realtime-Voice") ?? voicePolicy.voice,
  });
  if (!selection.success) return Response.json({ message: "Scegli un modello e una voce disponibili." }, { status: 400, headers });
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let sdp = "", size = 0;
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) { await reader.cancel(); return Response.json({ message: "Richiesta troppo grande." }, { status: 413, headers }); }
      sdp += decoder.decode(value, { stream: true });
    }
    sdp += decoder.decode();
    if (!sdp.startsWith("v=0")) return Response.json({ message: "SDP non valida." }, { status: 400, headers });
    const result = await realtimeVoice.start(sdp, request.signal, selection.data);
    return new Response(result.sdp, { status: 201, headers: {
      ...headers, "Content-Type": "application/sdp",
      "Set-Cookie": `${cookieName}=${result.id}; HttpOnly; SameSite=Strict; Path=/api/voice; Max-Age=3600`,
    } });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  if (!allowed(request)) return Response.json({ message: "Origine non autorizzata." }, { status: 403, headers });
  try {
    await realtimeVoice.stop(owner(request));
    return Response.json({ stopped: true }, { headers });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  if (!allowed(request)) return Response.json({ message: "Origine non autorizzata." }, { status: 403, headers });
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/json") return Response.json({ message: "Invia JSON valido." }, { status: 400, headers });
  // The acknowledgement is tiny and never carries transcripts or booking details.
  const reader = request.body?.getReader();
  let size = 0, body = ""; const decoder = new TextDecoder();
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); return Response.json({ message: "Richiesta troppo grande." }, { status: 413, headers }); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const parsed = playbackSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return Response.json({ message: "Riscontro audio non valido." }, { status: 400, headers });
    await realtimeVoice.acknowledgePlayback(owner(request), parsed.data);
    return Response.json({ received: true }, { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ message: "JSON non valido." }, { status: 400, headers });
    return failure(error);
  }
}
