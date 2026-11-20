import { checkAvailability } from "@/lib/availability";
import { reservations } from "@/lib/reservations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ status: "invalid", message: "Invia una richiesta JSON valida." }, { status: 400 });
  }

  let result;
  try { result = checkAvailability(input, new Date(), reservations.read()); }
  catch { return Response.json({ status: "invalid", message: "Archivio non disponibile. Riprova tra poco." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  return Response.json(result, {
    status: result.status === "invalid" ? 400 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
