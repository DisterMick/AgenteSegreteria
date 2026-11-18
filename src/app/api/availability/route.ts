import { checkAvailability } from "@/lib/availability";

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ status: "invalid", message: "Invia una richiesta JSON valida." }, { status: 400 });
  }

  const result = checkAvailability(input);
  return Response.json(result, {
    status: result.status === "invalid" ? 400 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
