import { expect, it } from "vitest";
import { openingGreeting, restaurant, restaurantSchema } from "./restaurant";
import { realtimeConfig } from "./voice/config";

it("normalizza i numeri prima del confronto e conserva lo zero geografico", () => {
  const parse = (main_number: string | null, handoff_number: string | null) =>
    restaurantSchema.safeParse({ ...restaurant, phone: { main_number, handoff_number } });
  expect(parse("+1 (202) 555-0100", "001 202 555 0100").success).toBe(false);
  const separate = parse("0039 (02) 000-0000", "+1 202 555 0101");
  expect(separate.data?.phone).toEqual({ main_number: "+39020000000", handoff_number: "+12025550101" });
  expect(parse(null, "linea-personale").success).toBe(false);
  expect(parse(null, null).success).toBe(true);
});
it("il chiamante inizia sul web, al telefono il saluto proviene dal locale", () => {
  expect(openingGreeting("web")).toBeNull();
  expect(openingGreeting("phone")).toBe(restaurant.channels.phone.greeting);
  expect(realtimeConfig(new Date(), undefined, "phone").instructions).toContain("Il server avvia il saluto");
  const channels = { ...restaurant.channels, web: { first_speaker: "agent", greeting: "Benvenuti al locale." } };
  const enabled = restaurantSchema.parse({ ...restaurant, channels });
  expect(openingGreeting("web", enabled.channels)).toBe("Benvenuti al locale.");
  expect(restaurantSchema.safeParse({ ...restaurant, channels: { ...channels, web: { first_speaker: "agent", greeting: " " } } }).success).toBe(false);
});
it("carica anche configurazioni precedenti ai canali", () => {
  const legacy: Partial<typeof restaurant> = { ...restaurant };
  delete legacy.phone;
  delete legacy.channels;
  const result = restaurantSchema.parse(legacy);
  expect(result.phone.handoff_number).toBeNull();
  expect(openingGreeting("web", result.channels)).toBeNull();
});
