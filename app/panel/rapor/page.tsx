import Link from "next/link";
import { connection } from "next/server";
import { businesses, loadBusiness } from "@/lib/business";
import { resolvePanelBusiness } from "@/lib/dal";
import { buildPilotReport } from "@/lib/report";
import { getStore, type Channel } from "@/lib/store";
import { verticals } from "@/lib/verticals";
import { PanelHeader } from "../panel-header";
import { PrintButton } from "./print-button";

export const metadata = { title: "Pilot raporu · Sırada" };

const PERIODS = [7, 30, 90] as const;

const dayFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" });
const tl = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

function duration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sn`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} dk`;
  return `${Math.round(seconds / 3600)} sa`;
}

const percent = (part: number, whole: number) => (whole > 0 ? `%${Math.round((part / whole) * 100)}` : "–");

export default async function ReportPage(props: PageProps<"/panel/rapor">) {
  await connection();
  const { isletme, gun, demo } = await props.searchParams;
  const store = await getStore();
  const { session, businessId } = await resolvePanelBusiness(isletme);
  const business = (await loadBusiness(store, businessId)) ?? businesses[0];

  const days = PERIODS.find((d) => String(d) === gun) ?? 30;
  const includeDemo = demo === "1";
  const channels: Channel[] = includeDemo ? ["whatsapp", "demo"] : ["whatsapp"];
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const [conversations, appointments] = await Promise.all([
    store.listConversations(business.id),
    store.listAppointmentsCreatedBetween(business.id, from.toISOString(), to.toISOString()),
  ]);
  const r = buildPilotReport({
    business,
    conversations,
    appointments,
    from: from.toISOString(),
    to: to.toISOString(),
    channels,
  });

  const link = (params: { gun?: number; demo?: boolean }) => {
    const q = new URLSearchParams({ isletme: business.id, gun: String(params.gun ?? days) });
    if (params.demo ?? includeDemo) q.set("demo", "1");
    return `/panel/rapor?${q}`;
  };
  const maxHour = Math.max(1, ...r.messagesByHour);
  const pill = (active: boolean) =>
    `btn btn-sm ${active ? "" : "btn-line"}`;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 print:max-w-none print:px-0 print:py-0">
      <div className="print:hidden">
        <PanelHeader session={session} basePath="/panel/rapor" businessId={business.id} />
        <Link href={`/panel?isletme=${business.id}`} className="mt-4 inline-block text-sm text-muted">
          ← Panele dön
        </Link>
      </div>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hand text-2xl">Sırada · pilot raporu</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{business.name}</h1>
          <p className="text-sm text-muted">
            {verticals[business.type].label} · {dayFmt.format(from)} – {dayFmt.format(to)} ({days} gün)
            {includeDemo && " · demo sohbetleri dahil"}
          </p>
        </div>
        <PrintButton />
      </header>

      <nav className="mt-4 flex flex-wrap items-center gap-2 print:hidden" aria-label="Dönem">
        {PERIODS.map((d) => (
          <Link key={d} href={link({ gun: d })} className={pill(d === days)}>
            Son {d} gün
          </Link>
        ))}
        <Link href={link({ demo: !includeDemo })} className={pill(includeDemo)}>
          Demo sohbetlerini dahil et
        </Link>
      </nav>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Yazan müşteri" value={r.customers} />
        <Metric label="Gelen mesaj" value={r.customerMessages} />
        <Metric
          label="İşletme kapalıyken gelen"
          value={r.afterHoursMessages}
          note={`tüm mesajlar içinde ${percent(r.afterHoursMessages, r.customerMessages)}`}
          highlight
        />
        <Metric
          label="Ortalama yanıt süresi"
          value={r.medianResponseSeconds === undefined ? "–" : duration(r.medianResponseSeconds)}
          note="ortanca"
        />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Asistanın aldığı randevu" value={r.appointments.byAssistant} highlight />
        <Metric
          label="Kapalıyken alınan randevu"
          value={r.appointments.afterHours}
          note="personel olmadan"
        />
        <Metric
          label="Randevuların en az değeri"
          value={r.estimatedValue.priced > 0 ? `${tl.format(r.estimatedValue.amount)} TL` : "–"}
          note="fiyat aralığının alt sınırıyla"
        />
        <Metric label="Hatırlatma gönderilen" value={r.remindersSent} />
      </section>

      <p className="mt-6 rounded-xl border border-border bg-card p-4 text-sm leading-6">
        Bu dönemde <strong>{r.customers}</strong> kişi yazdı ve asistan <strong>{r.assistantReplies}</strong> yanıt
        verdi. <strong>{r.afterHoursMessages}</strong> mesaj ({percent(r.afterHoursMessages, r.customerMessages)})
        işletme kapalıyken geldi. Asistan <strong>{r.appointments.byAssistant}</strong> randevu aldı
        {r.appointments.afterHours > 0 && (
          <>
            ; bunların <strong>{r.appointments.afterHours}</strong> tanesi mesai dışında, kimse telefona bakmadan
            oluştu
          </>
        )}
        .{" "}
        {r.handoffs > 0
          ? `${r.handoffs} konuşmada personel devreye girdi.`
          : "Hiçbir konuşmada personelin devreye girmesi gerekmedi."}
      </p>

      <section className="mt-8 break-inside-avoid">
        <h2 className="text-lg font-semibold">Mesajlar hangi saatte geliyor?</h2>
        <p className="text-xs text-muted">Koyu çubuklar işletmenin genelde kapalı olduğu saatler.</p>
        <div className="mt-3 flex h-36 items-end gap-1 rounded-xl border border-border bg-card p-3" role="img"
          aria-label="Saatlere göre gelen mesaj sayısı">
          {r.messagesByHour.map((count, hour) => (
            <div key={hour} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div
                className={`w-full rounded-sm ${closedAllWeek(business, hour) ? "bg-foreground/70" : "bg-accent"}`}
                style={{ height: `${(count / maxHour) * 100}%`, minHeight: count > 0 ? 2 : 0 }}
                title={`${hour}:00 – ${count} mesaj`}
              />
              <span className="text-[9px] text-muted">{hour % 3 === 0 ? hour : ""}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <Breakdown title="Hizmetlere göre randevular" rows={r.byService} />
        {r.byStaff.length > 0 && <Breakdown title="Çalışanlara göre randevular" rows={r.byStaff} />}
      </div>

      <p className="mt-8 text-xs text-muted">
        Sayılar {includeDemo ? "WhatsApp ve demo" : "WhatsApp"} konuşmalarından hesaplanır. Panelden elle eklenen{" "}
        {r.appointments.byPanel} randevu ve iptal edilen {r.appointments.cancelled} randevu asistanın randevularına
        dahil değildir.
      </p>
    </main>
  );
}

// Grafik renklendirmesi: o saat haftanın hiçbir gününde çalışma saatine girmiyorsa "kapalı".
function closedAllWeek(business: { workingHours: { open: string; close: string }[] }, hour: number): boolean {
  const toHour = (t: string) => Number(t.slice(0, 2)) + Number(t.slice(3, 5)) / 60;
  return !business.workingHours.some((h) => hour + 1 > toHour(h.open) && hour < toHour(h.close));
}

function Metric({
  label,
  value,
  note,
  highlight,
}: {
  label: string;
  value: number | string;
  note?: string;
  highlight?: boolean;
}) {
  return (
    <div className="break-inside-avoid rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-display text-4xl font-semibold leading-none ${highlight ? "text-accent" : ""}`}>{value}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="break-inside-avoid">
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Bu dönemde randevu yok.</p>
      ) : (
        <ul className="mt-3 space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
          {rows.map((row) => (
            <li key={row.name}>
              <div className="flex justify-between">
                <span>{row.name}</span>
                <span className="font-semibold">{row.count}</span>
              </div>
              <div className="mt-1 h-1.5 bg-border">
                <div className="h-1.5 bg-accent" style={{ width: `${(row.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
