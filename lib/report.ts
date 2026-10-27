import { weekdayOf } from "./availability";
import { priceFor, type Business } from "./business";
import type { Appointment, Channel, Conversation } from "./store";
import { localDate, localMinutes } from "./week";

// Pilot raporu: asistanın bir dönemde işletme için ne yaptığını sayılarla gösterir.
// Satış görüşmesinde ve pilot sonunda işletmeye gösterilir; hesaplar saf fonksiyon.

export interface PilotReport {
  from: string; // ISO, dahil
  to: string; // ISO, hariç
  customers: number; // Dönemde en az bir mesaj yazan kişi
  customerMessages: number;
  assistantReplies: number;
  afterHoursMessages: number; // İşletme kapalıyken gelen müşteri mesajları
  medianResponseSeconds?: number;
  appointments: {
    byAssistant: number; // Asistanın aldığı, iptal edilmemiş
    afterHours: number; // Bunlardan işletme kapalıyken alınanlar
    cancelled: number; // Dönemde alınıp sonra iptal edilenler
    byPanel: number; // Personelin panelden eklediği
  };
  remindersSent: number;
  handoffs: number; // Personelin devraldığı veya yazdığı konuşmalar
  // Asistanın aldığı randevuların fiyat bilgisinin alt sınırına göre en az değeri.
  estimatedValue: { amount: number; priced: number };
  byStaff: { name: string; count: number }[];
  byService: { name: string; count: number }[];
  messagesByHour: number[]; // 24 saat, işletmenin yerel saatiyle
}

// İşletmenin genel çalışma saatlerine göre o an açık mı?
export function isOpenAt(business: Business, at: string): boolean {
  const date = localDate(at, business.utcOffset);
  const minutes = localMinutes(at, business.utcOffset);
  const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return business.workingHours.some(
    (h) => h.day === weekdayOf(date) && minutes >= toMinutes(h.open) && minutes < toMinutes(h.close),
  );
}

// "900–1.200 TL" -> 900, "450 TL" -> 450, "Muayene sonrası belirlenir" -> undefined.
export function minimumPrice(priceInfo: string | undefined): number | undefined {
  const match = priceInfo?.match(/\d[\d.]*/);
  if (!match) return undefined;
  const value = Number(match[0].replace(/\./g, ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function countBy<T>(items: T[], key: (item: T) => string): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export function buildPilotReport(input: {
  business: Business;
  conversations: Conversation[];
  appointments: Appointment[]; // Dönemde oluşturulanlar, iptal edilenler dahil
  from: string;
  to: string;
  channels: Channel[];
}): PilotReport {
  const { business, from, to } = input;
  const [f, t] = [Date.parse(from), Date.parse(to)];
  const inPeriod = (at: string) => Date.parse(at) >= f && Date.parse(at) < t;

  const conversations = input.conversations.filter((c) => input.channels.includes(c.channel));
  const conversationIds = new Set(conversations.map((c) => c.id));
  // Panelden eklenen randevunun sohbeti yoktur; kanal filtresi sadece asistanınkilere uygulanır.
  const appointments = input.appointments.filter(
    (a) => inPeriod(a.createdAt) && (a.source === "panel" || (a.conversationId && conversationIds.has(a.conversationId))),
  );

  let customers = 0;
  let customerMessages = 0;
  let assistantReplies = 0;
  let afterHoursMessages = 0;
  let handoffs = 0;
  const responseSeconds: number[] = [];
  const messagesByHour = Array<number>(24).fill(0);

  for (const c of conversations) {
    const messages = c.transcript.filter((m) => inPeriod(m.at));
    const fromCustomer = messages.filter((m) => m.from === "customer");
    if (fromCustomer.length > 0) customers++;
    if (messages.some((m) => m.from === "staff")) handoffs++;
    customerMessages += fromCustomer.length;
    assistantReplies += messages.filter((m) => m.from === "assistant").length;
    for (const m of fromCustomer) {
      messagesByHour[Math.floor(localMinutes(m.at, business.utcOffset) / 60)]++;
      if (!isOpenAt(business, m.at)) afterHoursMessages++;
    }
    // Yanıt süresi: müşteri mesajından sonraki ilk asistan mesajına kadar geçen süre.
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].from !== "customer" || messages[i + 1]?.from === "customer") continue;
      const reply = messages.slice(i + 1).find((m) => m.from !== "customer");
      if (reply?.from === "assistant") {
        responseSeconds.push((Date.parse(reply.at) - Date.parse(messages[i].at)) / 1000);
      }
    }
  }

  const byAssistant = appointments.filter((a) => a.source === "assistant" && !a.cancelledAt);
  let amount = 0;
  let priced = 0;
  for (const a of byAssistant) {
    const price = minimumPrice(priceFor(business, a.serviceId, a.staffId));
    if (price !== undefined) {
      amount += price;
      priced++;
    }
  }

  responseSeconds.sort((a, b) => a - b);
  const median =
    responseSeconds.length > 0
      ? responseSeconds.length % 2
        ? responseSeconds[(responseSeconds.length - 1) / 2]
        : (responseSeconds[responseSeconds.length / 2 - 1] + responseSeconds[responseSeconds.length / 2]) / 2
      : undefined;

  const staffName = (id?: string) => business.staff.find((s) => s.id === id)?.name ?? "Belirtilmemiş";
  const serviceName = (id: string) => business.services.find((s) => s.id === id)?.name ?? id;

  return {
    from,
    to,
    customers,
    customerMessages,
    assistantReplies,
    afterHoursMessages,
    medianResponseSeconds: median,
    appointments: {
      byAssistant: byAssistant.length,
      afterHours: byAssistant.filter((a) => !isOpenAt(business, a.createdAt)).length,
      cancelled: appointments.filter((a) => a.cancelledAt).length,
      byPanel: appointments.filter((a) => a.source === "panel" && !a.cancelledAt).length,
    },
    remindersSent: appointments.filter((a) => a.reminderSentAt).length,
    handoffs,
    estimatedValue: { amount, priced },
    byStaff: business.staff.length > 0 ? countBy(byAssistant, (a) => staffName(a.staffId)) : [],
    byService: countBy(byAssistant, (a) => serviceName(a.serviceId)),
    messagesByHour,
  };
}
