import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { businesses, loadBusiness } from "@/lib/business";
import { appUrl, toCard } from "@/lib/calendar";
import { feedToken } from "@/lib/calendar-feed";
import { getStore, type Appointment } from "@/lib/store";
import { verticals } from "@/lib/verticals";
import { isDate, localDate, localMinutes, mondayOf, weekDays, addDays } from "@/lib/week";
import { resolvePanelBusiness } from "@/lib/dal";
import { PanelHeader } from "../panel-header";
import { cancelAppointmentAction } from "../actions";
import { ManualAppointmentForm } from "./manual-appointment-form";

export const metadata = { title: "Takvim · Sırada" };

const DAY_NAMES = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const HOUR_HEIGHT = 64; // px
// Çalışan renkleri (açık ve koyu temada okunur).
const STAFF_COLORS = [
  "bg-emerald-500/20 border-emerald-500 text-emerald-900 dark:text-emerald-100",
  "bg-sky-500/20 border-sky-500 text-sky-900 dark:text-sky-100",
  "bg-amber-500/20 border-amber-500 text-amber-900 dark:text-amber-100",
  "bg-fuchsia-500/20 border-fuchsia-500 text-fuchsia-900 dark:text-fuchsia-100",
  "bg-rose-500/20 border-rose-500 text-rose-900 dark:text-rose-100",
  "bg-indigo-500/20 border-indigo-500 text-indigo-900 dark:text-indigo-100",
];

const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const dayLabel = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function CalendarPage(props: PageProps<"/panel/takvim">) {
  await connection();
  const { isletme, hafta } = await props.searchParams;
  const store = await getStore();
  const { session, businessId } = await resolvePanelBusiness(isletme);
  const business = (await loadBusiness(store, businessId)) ?? businesses[0];
  const offset = business.utcOffset;

  const today = localDate(new Date(), offset);
  const monday = mondayOf(isDate(hafta) ? hafta : today);
  const days = weekDays(monday);
  const appointments = (await store.listAppointments(business.id)).filter((a) =>
    days.includes(localDate(a.start, offset)),
  );

  // Izgara, haftanın en erken açılışından en geç kapanışına kadar (çalışan saatleri dahil).
  const allHours = [...business.workingHours, ...business.staff.flatMap((s) => s.workingHours ?? [])];
  const gridStart = Math.floor(Math.min(...allHours.map((h) => toMin(h.open)), 9 * 60) / 60) * 60;
  const gridEnd = Math.ceil(Math.max(...allHours.map((h) => toMin(h.close)), 18 * 60) / 60) * 60;
  const hours = Array.from({ length: (gridEnd - gridStart) / 60 }, (_, i) => gridStart + i * 60);

  const colorOf = (staffId?: string) =>
    STAFF_COLORS[Math.max(0, business.staff.findIndex((p) => p.id === staffId)) % STAFF_COLORS.length];
  const isOpen = (date: string) => business.workingHours.some((h) => h.day === new Date(`${date}T00:00:00Z`).getUTCDay());

  const host = (await headers()).get("host");
  const base = appUrl() ?? (host ? `https://${host}` : "");
  const feedUrl = `${base}/api/takvim/${business.id}/${feedToken(business.id)}.ics`;
  const weekLink = (date: string) => `/panel/takvim?isletme=${business.id}&hafta=${date}`;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <PanelHeader session={session} basePath="/panel/takvim" businessId={business.id} />
      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{business.name}</h1>
          <p className="text-sm text-muted">{verticals[business.type].label} · Takvim</p>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <Link href={weekLink(addDays(monday, -7))} className="rounded-lg border border-border px-3 py-1.5">
            ← Önceki
          </Link>
          <Link href={weekLink(today)} className="rounded-lg border border-border px-3 py-1.5">
            Bu hafta
          </Link>
          <Link href={weekLink(addDays(monday, 7))} className="rounded-lg border border-border px-3 py-1.5">
            Sonraki →
          </Link>
          <Link href={`/panel?isletme=${business.id}`} className="ml-2 underline">
            Panele dön
          </Link>
        </nav>
      </header>

      {business.staff.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Çalışan renkleri">
          {business.staff.map((s) => (
            <li key={s.id} className={`rounded-full border px-2.5 py-1 ${colorOf(s.id)}`}>
              {s.name}
            </li>
          ))}
        </ul>
      )}

      <section className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
        <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))` }}>
          <div />
          {days.map((d, i) => (
            <div
              key={d}
              className={`border-b border-l border-border px-2 py-2 text-center text-xs ${d === today ? "font-bold text-accent" : "text-muted"}`}
            >
              {DAY_NAMES[i]} {dayLabel.format(new Date(`${d}T00:00:00Z`))}
            </div>
          ))}

          <div className="relative" style={{ height: hours.length * HOUR_HEIGHT }}>
            {hours.map((h, i) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted" style={{ top: i * HOUR_HEIGHT }}>
                {i > 0 ? toHm(h) : ""}
              </span>
            ))}
          </div>

          {days.map((d) => (
            <div
              key={d}
              className={`relative border-l border-border ${isOpen(d) ? "" : "bg-background/60"}`}
              style={{ height: hours.length * HOUR_HEIGHT }}
            >
              {hours.map((h, i) => (
                <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * HOUR_HEIGHT }} />
              ))}
              {layoutDay(
                appointments.filter((a) => localDate(a.start, offset) === d),
                offset,
              ).map(({ appointment: a, startMin, endMin, lane, lanes }) => {
                  const card = toCard(business, a);
                  const width = 100 / lanes;
                  return (
                    <div
                      key={a.id}
                      title={`${toHm(startMin)}–${toHm(endMin)} ${card.customerName} · ${card.serviceName}${card.staffName ? ` · ${card.staffName}` : ""}`}
                      className={`absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-[11px] leading-tight ${colorOf(a.staffId)}`}
                      style={{
                        top: ((startMin - gridStart) / 60) * HOUR_HEIGHT + 1,
                        height: Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT - 2, 18),
                        left: `calc(${lane * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                      }}
                    >
                      <span className="block truncate whitespace-nowrap">
                        <span className="font-semibold">{toHm(startMin)}</span> {card.customerName}
                      </span>
                      {endMin - startMin >= 40 && (
                        <span className="block truncate whitespace-nowrap opacity-80">{card.serviceName}</span>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold">Bu haftanın randevuları</h2>
          {appointments.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Bu hafta randevu yok.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card text-sm">
              {appointments.map((a) => {
                const card = toCard(business, a);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <div>
                      <p className="font-medium">
                        {DAY_NAMES[days.indexOf(localDate(a.start, offset))]} {toHm(localMinutes(a.start, offset))} ·{" "}
                        {card.customerName}
                      </p>
                      <p className="text-xs text-muted">
                        {card.serviceName}
                        {card.staffName ? ` · ${card.staffName}` : ""} · {a.source === "panel" ? "panelden" : "asistan"}
                        {a.reminderSentAt ? " · 🔔 hatırlatıldı" : ""}
                      </p>
                    </div>
                    <form action={cancelAppointmentAction}>
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="appointmentId" value={a.id} />
                      <button className="text-xs text-red-600 hover:underline">İptal et</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold">Randevu ekle</h2>
          <p className="mt-1 mb-3 text-sm text-muted">Telefonla veya yüz yüze alınan randevular için.</p>
          <div className="rounded-xl border border-border bg-card p-4">
            <ManualAppointmentForm
              businessId={business.id}
              services={business.services}
              staff={business.staff}
              defaultDate={today}
            />
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-xl border border-border bg-card p-4 text-sm">
        <h2 className="font-semibold">Google Takvim&apos;de görün</h2>
        <p className="mt-1 text-muted">
          Google Takvim&apos;de sol menüden <b>Diğer takvimler → + → URL ile</b> seçip bu adresi yapıştırın. Apple
          Takvim&apos;de <b>Dosya → Yeni Takvim Aboneliği</b>. Randevular takviminizde görünür; Google yeni randevuları
          birkaç saatte bir alır.
        </p>
        <code className="mt-3 block overflow-x-auto rounded-lg bg-background p-2 text-xs">{feedUrl}</code>
        <p className="mt-2 text-xs text-muted">
          Bu adresi paylaşmayın: müşteri adları ve telefonları içerir. Panel şifresi değişirse adres de değişir.
        </p>
      </section>
    </main>
  );
}

// Bir günün randevularını sütunlara yerleştirir: sadece zamanı çakışanlar yan yana daralır,
// çakışmayan randevu günün tüm genişliğini kullanır.
function layoutDay(list: Appointment[], offset: string) {
  const items = list
    .map((appointment) => ({
      appointment,
      startMin: localMinutes(appointment.start, offset),
      endMin: localMinutes(appointment.end, offset) || 24 * 60,
      lane: 0,
      lanes: 1,
    }))
    .sort((a, b) => a.startMin - b.startMin);

  // Birbirine zincirleme çakışan randevu grupları ayrı ayrı yerleştirilir.
  let group: typeof items = [];
  let groupEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    for (const item of group) {
      let lane = laneEnds.findIndex((end) => end <= item.startMin);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = item.endMin;
      item.lane = lane;
    }
    for (const item of group) item.lanes = laneEnds.length;
    group = [];
  };
  for (const item of items) {
    if (item.startMin >= groupEnd) flush();
    group.push(item);
    groupEnd = Math.max(groupEnd, item.endMin);
  }
  flush();
  return items;
}
