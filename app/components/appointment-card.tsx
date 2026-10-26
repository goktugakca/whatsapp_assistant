import { googleCalendarUrl, outlookCalendarUrl, type AppointmentCard } from "@/lib/calendar";

const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const timeFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });

// Randevu onay kartı: demo sohbetinde ve /randevu/[id] sayfasında aynı görünüm.
export function AppointmentCardView({ card, compact }: { card: AppointmentCard; compact?: boolean }) {
  const start = new Date(card.start);
  const link = "rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-background";
  return (
    <div className="rounded-xl border border-accent/40 bg-card p-4 text-sm shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Randevunuz oluşturuldu</p>
      <p className="mt-2 text-base font-semibold">{card.serviceName}</p>
      <p className="mt-1">
        {dateFmt.format(start)}, {timeFmt.format(start)}–{timeFmt.format(new Date(card.end))}
      </p>
      <dl className="mt-3 grid gap-1 text-muted">
        {card.staffName && (
          <div className="flex gap-2">
            <dt>Çalışan:</dt>
            <dd className="text-foreground">{card.staffName}</dd>
          </div>
        )}
        {card.priceInfo && (
          <div className="flex gap-2">
            <dt>Fiyat:</dt>
            <dd className="text-foreground">{card.priceInfo}</dd>
          </div>
        )}
        {!compact && (
          <div className="flex gap-2">
            <dt>Ad:</dt>
            <dd className="text-foreground">{card.customerName}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt>Adres:</dt>
          <dd className="text-foreground">
            {card.businessName}, {card.address}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <a className={link} href={googleCalendarUrl(card)} target="_blank" rel="noopener noreferrer">
          Google Takvim&apos;e ekle
        </a>
        <a className={link} href={`/api/randevu/${card.id}/ics`}>
          Apple / diğer takvim (.ics)
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
    </div>
  );
}
