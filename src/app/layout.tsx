import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pizzeria Demo · Agente Segreteria",
  description: "Laboratorio locale della receptionist AI: dati fittizi e disponibilità simulata, senza prenotazioni reali.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body>{children}</body></html>;
}
