import { googleCalendarUrl, outlookCalendarUrl, type AppointmentCard } from "@/lib/calendar";

const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const timeFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });

// Randevu onayı, salonun randevu defterinden bir sayfa gibi görünür: çizgili kâğıt, sol
// kenarda el yazısıyla saat, satıra yazılmış müşteri ve hizmet. Demo sohbetinde,
// /randevu/[id] sayfasında ve ana sayfadaki örnekte aynı bileşen.
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
  const who = compact ? card.serviceName : `${card.customerName} · ${card.serviceName}`;
  const detail = [card.staffName, card.priceInfo].filter(Boolean).join(" · ");
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-card shadow-[0_10px_30px_-18px_rgb(35_70_184/0.45)]">
      <div className="ruled pb-[var(--line)] [--line:30px] [--gutter:70px]">
        <div className="flex h-[var(--line)] items-end justify-between pr-4 pl-[calc(var(--gutter)+12px)] text-[13px] leading-[var(--line)]">
          <span className="font-medium capitalize">{dateFmt.format(start)}</span>
          <span className="truncate pl-3 text-muted">{card.businessName}</span>
        </div>
        <div className="relative">
          <span className="hand absolute left-0 top-0 w-[var(--gutter)] pr-2 text-right text-[30px] leading-[var(--line)]">
            {timeFmt.format(start)}
          </span>
          <div className="hand pr-4 pl-[calc(var(--gutter)+12px)] leading-[var(--line)]">
            <p className="text-[24px]">{who}</p>
            {detail && <p className="text-[21px] opacity-80">{detail}</p>}
            <p className="text-[21px] opacity-80">bitiş {timeFmt.format(new Date(card.end))} ✓</p>
          </div>
        </div>
        <p className="truncate pr-4 pl-[calc(var(--gutter)+12px)] text-[12px] leading-[var(--line)] text-muted">
          {card.address}
        </p>
      </div>

      {actions && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-3">
          <a className="btn btn-line btn-sm" href={googleCalendarUrl(card)} target="_blank" rel="noopener noreferrer">
            Google Takvim
          </a>
          <a className="btn btn-line btn-sm" href={`/api/randevu/${card.id}/ics`}>
            Apple / diğer
          </a>
          <a className="btn btn-line btn-sm" href={outlookCalendarUrl(card)} target="_blank" rel="noopener noreferrer">
            Outlook
          </a>
          {card.mapsUrl && (
            <a className="btn btn-line btn-sm" href={card.mapsUrl} target="_blank" rel="noopener noreferrer">
              Yol tarifi
            </a>
          )}
        </div>
      )}
    </div>
  );
}
