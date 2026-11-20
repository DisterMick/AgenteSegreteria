import Link from "next/link";
import { AvailabilityForm } from "@/components/availability-form";
import { VoiceCall } from "@/components/voice-call";
import { restaurant, restaurantClock } from "@/lib/restaurant";

export const dynamic = "force-dynamic";

export default function Home() {
  const { date } = restaurantClock();

  return (
    <>
      <a className="skip-link" href="#contenuto">Vai al contenuto</a>
      <div className="shell">
        <header className="site-header">
          <Link className="brand" href="/" aria-label="Agente Segreteria, pagina iniziale">
            <span className="brand-mark" aria-hidden="true">as.</span>
            <span>Agente Segreteria<small>Il laboratorio della tua receptionist AI</small></span>
          </Link>
          <span className="badge">Ambiente demo</span>
        </header>

        <main id="contenuto">
          <section className="intro" aria-labelledby="titolo">
            <p className="eyebrow">01 / Il ristorante</p>
            <h1 id="titolo">{restaurant.name}<span>Si comincia da un tavolo.</span></h1>
            <p className="intro-copy">La base della tua segreteria vocale: informazioni del locale e una prima verifica dei posti disponibili.</p>
            <div className="status-line"><span className="status-dot" aria-hidden="true" /><strong>Solo dati fittizi</strong><span>Voce opzionale con budget limitato</span></div>
          </section>

          <div className="workspace">
            <section className="availability-panel" aria-labelledby="disponibilita">
              <p className="eyebrow">Prova il primo strumento</p>
              <h2 id="disponibilita">C’è posto per te?</h2>
              <p>Controlla un turno della pizzeria demo. La verifica tiene conto delle prenotazioni salvate.</p>
              <AvailabilityForm today={date} shifts={restaurant.shifts} maxPartySize={restaurant.max_party_size} horizonDays={restaurant.booking_horizon_days} />
              <p className="panel-note">Per prenotare, parla con la receptionist e conferma il riepilogo. La sola verifica non blocca posti.</p>
            </section>

            <section className="restaurant-panel" aria-labelledby="informazioni">
              <p className="eyebrow">Le informazioni approvate</p>
              <h2 id="informazioni">Il locale, in breve.</h2>
              <dl className="facts">
                <div><dt>Quando siamo aperti</dt><dd>{restaurant.opening_days.map(day => ["dom", "lun", "mar", "mer", "gio", "ven", "sab"][day]).join(", ")} · {restaurant.hours.opens}–{restaurant.hours.closes}<small>Ora locale · {restaurant.timezone}</small></dd></div>
                <div><dt>I turni</dt><dd>{restaurant.shifts.map((shift) => `${shift.start}–${shift.end}`).join(" / ")}</dd></div>
                <div><dt>La sala</dt><dd>{restaurant.tables.length} tavoli · {restaurant.tables.reduce((total, table) => total + table.seats, 0)} posti<small>Massimo {restaurant.max_party_size} persone per prenotazione, tavoli non unibili.</small></dd></div>
                <div><dt>I servizi</dt><dd>{restaurant.services.join(", ")}</dd></div>
              </dl>
            </section>
          </div>

          <section className="menu-section" aria-labelledby="menu">
            <div className="section-heading"><div><p className="eyebrow">Semplice, anche nel menu</p><h2 id="menu">Due classici per iniziare.</h2></div><span className="caption">Menu fittizio · versione {restaurant.version}</span></div>
            <div className="menu-items">
              {restaurant.menu.map((item, index) => (
                <article className="menu-item" key={item.name}>
                  <span className="menu-number" aria-hidden="true">0{index + 1}</span>
                  <div><h3>{item.name}</h3><p>{item.ingredients}</p><p className="allergens">Allergeni: {item.allergens.join(", ")}</p></div>
                </article>
              ))}
            </div>
            <p className="allergen-note">{restaurant.allergen_notice}</p>
          </section>

          <VoiceCall />
        </main>

        <footer><span>Agente Segreteria / {restaurant.name}</span><span>Un locale inventato. Una base concreta.</span></footer>
      </div>
    </>
  );
}
