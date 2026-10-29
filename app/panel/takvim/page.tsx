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
// Kapalı saatler: çizgili sayfada kurşun kalemle taranmış gibi hafif gri.
const CLOSED_BG = "repeating-linear-gradient(135deg, color-mix(in srgb, var(--border) 45%, transparent) 0 2px, transparent 2px 8px)";
// Çalışan renkleri (açık ve koyu temada okunur).
const STAFF_COLORS = [
  "bg-[#2346b8]/12 border-[#2346b8] text-[#1a3388] dark:text-[#c9d7ff]", // tükenmez mavisi
  "bg-[#e8738a]/18 border-[#e8738a] text-[#8f2a40] dark:text-[#ffd0da]", // kenar pembesi
  "bg-[#2f7a4b]/15 border-[#2f7a4b] text-[#1d4d2f] dark:text-[#c5ebd2]", // yeşil kalem
  "bg-[#7a4bc2]/15 border-[#7a4bc2] text-[#46287a] dark:text-[#e0d0ff]", // mor kalem
  "bg-[#d98a1c]/18 border-[#d98a1c] text-[#6b4108] dark:text-[#f7ddb0]", // turuncu fosforlu
  "bg-[#1c2333]/10 border-[#1c2333] text-[#1c2333] dark:border-[#e6ebf7] dark:bg-[#e6ebf7]/10 dark:text-[#e6ebf7]", // kurşun kalem
];

const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const dayLabel = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function CalendarPage(props: PageProps<"/panel/takvim">) {
  await connection();
  const { isletme, hafta, calisan } = await props.searchParams;
  const store = await getStore();
  const { session, businessId } = await resolvePanelBusiness(isletme);
  const business = (await loadBusiness(store, businessId)) ?? businesses[0];
  const offset = business.utcOffset;

  const today = localDate(new Date(), offset);
  const monday = mondayOf(isDate(hafta) ? hafta : today);
  const days = weekDays(monday);
  // Çalışan sekmeleri: "Hepsi" veya tek çalışan. Çok çalışanlı işletmede aynı saate birkaç
  // randevu düşünce ızgara karışır; 3'ten fazla çalışan varsa varsayılan ilk çalışandır.
  const selectedStaff = business.staff.find((s) => s.id === calisan);
  const staffView = selectedStaff ?? (calisan === "hepsi" || business.staff.length <= 3 ? undefined : business.staff[0]);
  const weekAppointments = (await store.listAppointments(business.id)).filter((a) =>
    days.includes(localDate(a.start, offset)),
  );
  const appointments = staffView ? weekAppointments.filter((a) => a.staffId === staffView.id) : weekAppointments;

  // Izgara, haftanın en erken açılışından en geç kapanışına kadar (çalışan saatleri dahil).
  const allHours = [...business.workingHours, ...business.staff.flatMap((s) => s.workingHours ?? [])];
  const gridStart = Math.floor(Math.min(...allHours.map((h) => toMin(h.open)), 9 * 60) / 60) * 60;
  const gridEnd = Math.ceil(Math.max(...allHours.map((h) => toMin(h.close)), 18 * 60) / 60) * 60;
  const hours = Array.from({ length: (gridEnd - gridStart) / 60 }, (_, i) => gridStart + i * 60);

  const colorOf = (staffId?: string) =>
    STAFF_COLORS[Math.max(0, business.staff.findIndex((p) => p.id === staffId)) % STAFF_COLORS.length];
  // Seçili çalışanın (yoksa işletmenin) o gün çalıştığı aralık; ızgarada gri alan dışı.
  const hoursFor = staffView?.workingHours ?? business.workingHours;
  const openRange = (date: string) => hoursFor.find((h) => h.day === new Date(`${date}T00:00:00Z`).getUTCDay());
  const isOpen = (date: string) => !!openRange(date);

  const host = (await headers()).get("host");
  const base = appUrl() ?? (host ? `https://${host}` : "");
  const feedUrl = `${base}/api/takvim/${business.id}/${feedToken(business.id)}.ics`;
  const staffParam = staffView ? `&calisan=${staffView.id}` : business.staff.length > 3 ? "&calisan=hepsi" : "";
  const weekLink = (date: string) => `/panel/takvim?isletme=${business.id}&hafta=${date}${staffParam}`;
  const staffLink = (id: string) => `/panel/takvim?isletme=${business.id}&hafta=${monday}&calisan=${id}`;
  const countFor = (id?: string) => weekAppointments.filter((a) => (id ? a.staffId === id : true)).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <PanelHeader session={session} basePath="/panel/takvim" businessId={business.id} />
      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{business.name}</h1>
          <p className="text-sm text-muted">{verticals[business.type].label} · Takvim</p>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <Link href={weekLink(addDays(monday, -7))} className="btn btn-line btn-sm">
            ← Önceki
          </Link>
          <Link href={weekLink(today)} className="btn btn-line btn-sm">
            Bu hafta
          </Link>
          <Link href={weekLink(addDays(monday, 7))} className="btn btn-line btn-sm">
            Sonraki →
          </Link>
          <Link href={`/panel?isletme=${business.id}`} className="ml-2 underline">
            Panele dön
          </Link>
        </nav>
      </header>

      {business.staff.length > 0 && (
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Çalışan">
          <Link href={staffLink("hepsi")} className={`tab ${staffView ? "" : "tab-active"}`} aria-current={staffView ? undefined : "page"}>
            Hepsi <span className="text-muted">({countFor()})</span>
          </Link>
          {business.staff.map((s) => (
            <Link
              key={s.id}
              href={staffLink(s.id)}
              className={`tab ${staffView?.id === s.id ? "tab-active" : ""}`}
              aria-current={staffView?.id === s.id ? "page" : undefined}
            >
              <span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border ${colorOf(s.id)}`} aria-hidden />
              {s.name} <span className="text-muted">({countFor(s.id)})</span>
            </Link>
          ))}
        </nav>
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
              className="relative border-l border-border"
              style={{ height: hours.length * HOUR_HEIGHT, background: isOpen(d) ? undefined : CLOSED_BG }}
            >
              {hours.map((h, i) => (
                <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * HOUR_HEIGHT }} />
              ))}
              {/* Açılıştan önce ve kapanıştan sonra gri: tek çalışan görünümünde onun kendi saatleri. */}
              {(() => {
                const r = openRange(d);
                if (!r) return null;
                const top = ((toMin(r.open) - gridStart) / 60) * HOUR_HEIGHT;
                const bottom = ((gridEnd - toMin(r.close)) / 60) * HOUR_HEIGHT;
                return (
                  <>
                    {top > 0 && <div className="absolute inset-x-0 top-0" style={{ height: top, background: CLOSED_BG }} />}
                    {bottom > 0 && <div className="absolute inset-x-0 bottom-0" style={{ height: bottom, background: CLOSED_BG }} />}
                  </>
                );
              })()}
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
          <h2 className="text-lg font-semibold">Bu haftanın randevuları{staffView ? ` · ${staffView.name}` : ""}</h2>
          {appointments.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Bu hafta {staffView ? `${staffView.name} için ` : ""}randevu yok.</p>
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
              key={staffView?.id ?? "hepsi"}
              defaultStaffId={staffView?.id}
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
