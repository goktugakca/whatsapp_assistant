import Link from "next/link";
import { connection } from "next/server";
import { businesses, loadBusiness } from "@/lib/business";
import { getStore, type Channel, type Conversation } from "@/lib/store";
import { verticals } from "@/lib/verticals";
import { resolvePanelBusiness } from "@/lib/dal";
import { PanelHeader } from "./panel-header";
import { blockConversation, resumeAssistant, sendStaffReply } from "./actions";

export const metadata = { title: "Panel · Sırada" };

const timeFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: "WhatsApp", instagram: "Instagram", demo: "Demo" };

function fmt(iso: string) {
  return timeFmt.format(new Date(iso));
}

export default async function PanelPage(props: PageProps<"/panel">) {
  await connection(); // Her istekte güncel veri
  const { isletme, kanal } = await props.searchParams;
  const store = await getStore();
  const { session, businessId } = await resolvePanelBusiness(isletme);
  const business = (await loadBusiness(store, businessId)) ?? businesses[0];
  const [conversations, appointments, waitlist] = await Promise.all([
    store.listConversations(business.id),
    store.listAppointments(business.id),
    session.isAdmin ? store.listWaitlist() : Promise.resolve([]),
  ]);
  const handoffs = conversations.filter((c) => c.status === "handoff");
  // Konuşmalar kanala göre sekmelerde: WhatsApp, Instagram, demo. Demo sekmesi sadece demo
  // konuşması varsa görünür. Varsayılan sekme, konuşması olan ilk kanal.
  const tabs = (["whatsapp", "instagram", "demo"] as const)
    .map((channel) => ({
      channel,
      label: CHANNEL_LABEL[channel],
      count: conversations.filter((c) => c.channel === channel).length,
      waiting: handoffs.filter((c) => c.channel === channel).length,
    }))
    .filter((t) => t.channel !== "demo" || t.count > 0);
  const activeChannel: Channel =
    tabs.some((t) => t.channel === kanal) ? (kanal as Channel) : (tabs.find((t) => t.count > 0)?.channel ?? "whatsapp");
  const shown = conversations.filter((c) => c.channel === activeChannel);
  const serviceName = (id: string) => business.services.find((s) => s.id === id)?.name ?? id;
  const staffName = (id?: string) => business.staff.find((s) => s.id === id)?.name ?? "–";
  const hasStaff = business.staff.length > 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <PanelHeader session={session} basePath="/panel" businessId={business.id} />
      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{business.name}</h1>
          <p className="text-sm text-muted">{verticals[business.type].label} · İşletme paneli</p>
          <Link
            href={`/panel/ayarlar?isletme=${business.id}`}
            className="mt-2 btn btn-line btn-sm"
          >
            Ayarlar: saatler, hizmetler, çalışanlar
          </Link>
          <Link
            href={`/panel/takvim?isletme=${business.id}`}
            className="mt-2 ml-2 btn btn-line btn-sm"
          >
            Haftalık takvim
          </Link>
          <Link
            href={`/panel/rapor?isletme=${business.id}`}
            className="mt-2 ml-2 btn btn-line btn-sm"
          >
            Pilot raporu
          </Link>
          <Link href={`/panel/ornekler?isletme=${business.id}`} className="mt-2 ml-2 btn btn-line btn-sm">
            Fotoğrafla fiyat örnekleri
          </Link>
        </div>
        <dl className="flex gap-6 text-sm">
          <Stat label="Konuşma" value={conversations.length} />
          <Stat label="Sizi bekliyor" value={handoffs.length} highlight={handoffs.length > 0} />
          <Stat label="Randevu" value={appointments.length} />
        </dl>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Randevular</h2>
        {appointments.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Henüz randevu yok.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Zaman</th>
                  <th className="px-4 py-2 font-medium">Müşteri</th>
                  <th className="px-4 py-2 font-medium">Hizmet</th>
                  {hasStaff && <th className="px-4 py-2 font-medium">Çalışan</th>}
                  <th className="px-4 py-2 font-medium">İletişim</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-4 py-2 whitespace-nowrap">{fmt(a.start)}</td>
                    <td className="px-4 py-2">{a.customerName}</td>
                    <td className="px-4 py-2">{serviceName(a.serviceId)}</td>
                    {hasStaff && <td className="px-4 py-2">{staffName(a.staffId)}</td>}
                    <td className="px-4 py-2 font-mono text-xs">{a.contact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Konuşmalar</h2>
        <nav className="mt-3 flex flex-wrap gap-2" aria-label="Kanal">
          {tabs.map((t) => (
            <Link
              key={t.channel}
              href={`/panel?isletme=${business.id}&kanal=${t.channel}`}
              className={`tab ${t.channel === activeChannel ? "tab-active" : ""}`}
              aria-current={t.channel === activeChannel ? "page" : undefined}
            >
              {t.label} <span className="text-muted">({t.count})</span>
              {t.waiting > 0 && <span className="stamp stamp-alert ml-2 text-xs">{t.waiting} bekliyor</span>}
            </Link>
          ))}
        </nav>
        {shown.length === 0 && (
          <p className="mt-3 text-sm text-muted">
            {activeChannel === "demo"
              ? "Henüz demo konuşması yok."
              : `Henüz ${CHANNEL_LABEL[activeChannel]} konuşması yok.`}
          </p>
        )}
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {shown.map((c) => (
            <ConversationCard key={c.id} conversation={c} />
          ))}
        </div>
      </section>

      {waitlist.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Pilot başvuruları</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {waitlist.map((w) => (
              <li key={w.id} className="rounded-lg border border-border bg-card px-4 py-2">
                <span className="font-medium">{w.businessName}</span>
                {w.businessType ? ` (${w.businessType})` : ""} · {w.contactName} · {w.phone}
                {w.city ? ` · ${w.city}` : ""} <span className="text-muted">({fmt(w.createdAt)})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`font-display text-3xl font-semibold leading-none ${highlight ? "text-accent" : ""}`}>{value}</dd>
    </div>
  );
}

function ConversationCard({ conversation: c }: { conversation: Conversation }) {
  const lead = c.lead;
  const leadFields = [
    ["Ad", lead?.name],
    ["Ülke", lead?.country],
    ["Dil", lead?.language],
    ["Hizmet", lead?.interest],
    ["Zaman", lead?.timeframe],
    ["Not", lead?.notes],
  ].filter(([, v]) => v);

  return (
    <article
      className={`flex flex-col rounded-xl border bg-card ${c.status === "handoff" ? "border-accent" : "border-border"}`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="font-medium">{c.contactName ?? c.contact}</p>
          <p className="text-xs text-muted">
            {c.channel === "whatsapp" ? `WhatsApp · ${c.contact}` : CHANNEL_LABEL[c.channel]} · {fmt(c.updatedAt)}
          </p>
        </div>
        {c.status === "handoff" ? (
          <span className="stamp stamp-alert">
            Sizi bekliyor
          </span>
        ) : c.status === "blocked" ? (
          <span className="stamp text-muted">Engellendi</span>
        ) : (
          <span className="stamp text-muted">Asistan yanıtlıyor</span>
        )}
      </header>

      {c.status !== "bot" && c.handoffReason && (
        <p className="border-b border-dashed border-border bg-bubble-out px-4 py-2 text-xs">
          {c.status === "blocked" ? "Engelleme nedeni" : "Devretme nedeni"}: {c.handoffReason}
        </p>
      )}

      {leadFields.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-border px-4 py-3 text-xs">
          {leadFields.map(([k, v]) => (
            <div key={k} className="flex gap-1">
              <dt className="text-muted">{k}:</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="max-h-72 space-y-2 overflow-y-auto px-4 py-3">
        {c.transcript.map((m, i) => (
          <div key={i} className={`flex ${m.from === "customer" ? "justify-start" : "justify-end"}`}>
            <p
              dir="auto"
              className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-1.5 text-sm ${
                m.from === "customer" ? "bg-bubble-in border border-border" : "bg-bubble-out"
              }`}
            >
              {m.from === "staff" && <span className="block text-[10px] font-semibold text-muted">Personel</span>}
              {m.mediaId && (
                <a href={`/api/media/${m.mediaId}`} target="_blank" rel="noopener noreferrer" className="mb-1 block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- yetki kontrollü, önbelleklenmeyen kullanıcı görseli */}
                  <img
                    src={`/api/media/${m.mediaId}`}
                    alt="Müşterinin gönderdiği fotoğraf"
                    className="max-h-48 rounded-lg border border-border object-cover"
                  />
                </a>
              )}
              {m.text}
            </p>
          </div>
        ))}
      </div>

      <footer className="mt-auto space-y-2 border-t border-border px-4 py-3">
        <form action={sendStaffReply} className="flex gap-2">
          <input type="hidden" name="conversationId" value={c.id} />
          <input
            name="text"
            placeholder="Personel olarak yanıt yaz"
            required
            className="field flex-1"
          />
          <button className="btn">
            Gönder
          </button>
        </form>
        <div className="flex justify-between text-xs">
          {c.status !== "bot" ? (
            <form action={resumeAssistant}>
              <input type="hidden" name="conversationId" value={c.id} />
              <button className="text-muted underline">
                {c.status === "blocked" ? "Engeli kaldır, asistan yeniden yanıtlasın" : "Asistanı bu konuşmada yeniden aç"}
              </button>
            </form>
          ) : (
            <span />
          )}
          {c.status !== "blocked" && (
            <form action={blockConversation}>
              <input type="hidden" name="conversationId" value={c.id} />
              <button className="text-red-600 hover:underline" title="Asistan bu kişiye bir daha yanıt vermez">
                Engelle
              </button>
            </form>
          )}
        </div>
      </footer>
    </article>
  );
}
