import { connection } from "next/server";
import { businesses, getBusinessById } from "@/lib/business";
import { getStore, type Conversation } from "@/lib/store";
import { verticals } from "@/lib/verticals";
import { BusinessPicker } from "../business-picker";
import { resumeAssistant, sendStaffReply } from "./actions";

export const metadata = { title: "Panel · Randevu Asistanı" };

const timeFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function fmt(iso: string) {
  return timeFmt.format(new Date(iso));
}

export default async function PanelPage(props: PageProps<"/panel">) {
  await connection(); // Her istekte güncel veri
  const { isletme } = await props.searchParams;
  const business = (typeof isletme === "string" && getBusinessById(isletme)) || businesses[0];
  const store = getStore();
  const [conversations, appointments, waitlist] = await Promise.all([
    store.listConversations(business.id),
    store.listAppointments(business.id),
    store.listWaitlist(),
  ]);
  const handoffs = conversations.filter((c) => c.status === "handoff");
  const serviceName = (id: string) => business.services.find((s) => s.id === id)?.name ?? id;
  const staffName = (id?: string) => business.staff.find((s) => s.id === id)?.name ?? "–";
  const hasStaff = business.staff.length > 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <BusinessPicker basePath="/panel" currentId={business.id} />
      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{business.name}</h1>
          <p className="text-sm text-muted">{verticals[business.type].label} · İşletme paneli</p>
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
        {conversations.length === 0 && (
          <p className="mt-2 text-sm text-muted">Henüz konuşma yok. /demo sayfasından deneyebilirsiniz.</p>
        )}
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {conversations.map((c) => (
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
      <dd className={`text-xl font-bold ${highlight ? "text-orange-600" : ""}`}>{value}</dd>
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
      className={`flex flex-col rounded-xl border bg-card ${c.status === "handoff" ? "border-orange-400" : "border-border"}`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="font-medium">{c.contactName ?? c.contact}</p>
          <p className="text-xs text-muted">
            {c.channel === "whatsapp" ? `WhatsApp · ${c.contact}` : "Demo"} · {fmt(c.updatedAt)}
          </p>
        </div>
        {c.status === "handoff" ? (
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
            Sizi bekliyor
          </span>
        ) : (
          <span className="rounded-full bg-bubble-out px-2 py-0.5 text-xs font-medium">Asistan yanıtlıyor</span>
        )}
      </header>

      {c.status === "handoff" && c.handoffReason && (
        <p className="border-b border-border bg-orange-50 px-4 py-2 text-xs text-orange-900">
          Devretme nedeni: {c.handoffReason}
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
            className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          />
          <button className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground">
            Gönder
          </button>
        </form>
        {c.status === "handoff" && (
          <form action={resumeAssistant}>
            <input type="hidden" name="conversationId" value={c.id} />
            <button className="text-xs text-muted underline">Asistanı bu konuşmada yeniden aç</button>
          </form>
        )}
      </footer>
    </article>
  );
}
