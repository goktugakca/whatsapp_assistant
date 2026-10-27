import { googleCalendarUrl, outlookCalendarUrl, ticketNumber, type AppointmentCard } from "@/lib/calendar";

const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const timeFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });

// Randevu onayı bir sıra fişi gibi görünür: demo sohbetinde, /randevu/[id] sayfasında ve
// ana sayfadaki örnekte aynı bileşen. actions=false örnek fişte takvim düğmelerini gizler.
export function AppointmentCardView({
  card,
  compact,
  actions = true,
}: {
  card: AppointmentCard;
  compact?: boolean;
  actions?: boolean;
}) {
  const start = new Date(card.start);
  const link =
    "border border-foreground/80 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wide hover:bg-foreground hover:text-background";
  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-card text-sm shadow-[0_1px_0_var(--border),0_8px_24px_-12px_rgb(0_0_0/0.25)]">
      <div className="flex items-baseline justify-between px-5 pt-4 font-mono text-[11px] uppercase tracking-widest text-muted">
        <span>Sırada · Randevu fişi</span>
        <span className="text-foreground">No. {ticketNumber(card.id)}</span>
      </div>

      <div className="px-5 pb-4 pt-3">
        <p className="font-display text-6xl font-bold leading-none tracking-tight text-accent">
          {timeFmt.format(start)}
        </p>
        <p className="mt-1 font-medium">{dateFmt.format(start)}</p>
        <p className="mt-3 text-base font-semibold">{card.serviceName}</p>
        {card.staffName && <p className="text-muted">{card.staffName}</p>}
      </div>

      <div className="ticket ticket-notch">
        <hr className="perforation" />
      </div>

      <dl className="grid gap-1 px-5 py-4 text-[13px]">
        {card.priceInfo && <Row label="Fiyat" value={card.priceInfo} />}
        {!compact && <Row label="Ad" value={card.customerName} />}
        <Row label="Bitiş" value={timeFmt.format(new Date(card.end))} />
        <Row label="Yer" value={`${card.businessName}, ${card.address}`} />
      </dl>

      {actions && (
        <div className="flex flex-wrap gap-1.5 px-5 pb-5">
          <a className={link} href={googleCalendarUrl(card)} target="_blank" rel="noopener noreferrer">
            Google Takvim
          </a>
          <a className={link} href={`/api/randevu/${card.id}/ics`}>
            Apple / <span lang="en">.ics</span>
          </a>
          <a className={link} href={outlookCalendarUrl(card)} target="_blank" rel="noopener noreferrer">
            Outlook
          </a>
          {card.mapsUrl && (
            <a className={link} href={card.mapsUrl} target="_blank" rel="noopener noreferrer">
              Yol tarifi
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-12 shrink-0 font-mono text-[11px] uppercase leading-5 tracking-wide text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
