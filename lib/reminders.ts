import { loadBusiness, phoneNumberIdFor } from "./business";
import { appUrl, toCard } from "./calendar";
import { normalizePhone } from "./phone";
import type { Store } from "./store";
import { localDate, addDays } from "./week";
import { sendTemplate } from "./whatsapp";

// Hatırlatma şablonu (Meta'da onaylanmış olmalı). Gövde parametreleri sırasıyla:
// {{1}} müşteri adı, {{2}} hizmet, {{3}} gün ve saat, {{4}} işletme adı.
export function reminderTemplate() {
  const name = process.env.WHATSAPP_REMINDER_TEMPLATE;
  return name ? { name, language: process.env.WHATSAPP_REMINDER_LANGUAGE ?? "tr" } : undefined;
}

const whenFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export interface ReminderReport {
  sent: number;
  skipped: { id: string; reason: string }[];
  failed: { id: string; error: string }[];
}

// Yarın (işletmenin yerel takvimine göre) randevusu olan müşterilere hatırlatma gönderir.
// Günde bir kez, akşam çalıştırılmak üzere tasarlandı; tekrar çalışırsa aynı kişiye ikinci kez yazmaz.
export async function sendTomorrowReminders(deps: {
  store: Store;
  now?: Date;
  send?: typeof sendTemplate;
}): Promise<ReminderReport> {
  const { store } = deps;
  const now = deps.now ?? new Date();
  const send = deps.send ?? sendTemplate;
  const report: ReminderReport = { sent: 0, skipped: [], failed: [] };
  const template = reminderTemplate();

  // Önümüzdeki 48 saat; her randevu kendi işletmesinin "yarın"ına göre süzülür.
  const candidates = await store.listAppointmentsForReminder(
    now.toISOString(),
    new Date(now.getTime() + 48 * 60 * 60_000).toISOString(),
  );

  for (const appointment of candidates) {
    const business = await loadBusiness(store, appointment.businessId);
    if (!business) continue;
    if (localDate(appointment.start, business.utcOffset) !== addDays(localDate(now, business.utcOffset), 1)) continue;

    const to = normalizePhone(appointment.contact);
    const phoneNumberId = phoneNumberIdFor(business);
    const skip = (reason: string) => report.skipped.push({ id: appointment.id, reason });
    if (!to) {
      skip("telefon numarası yok (demo veya numarasız randevu)");
      continue;
    }
    if (!phoneNumberId) {
      skip("işletmenin WhatsApp numarası bağlı değil");
      continue;
    }
    if (!template) {
      skip("WHATSAPP_REMINDER_TEMPLATE tanımlı değil");
      continue;
    }
    if (!(await store.claimReminder(appointment.id))) continue; // başka bir çalıştırma aldı

    const card = toCard(business, appointment);
    const when = whenFmt.format(new Date(appointment.start));
    try {
      await send({
        phoneNumberId,
        to,
        name: template.name,
        language: template.language,
        bodyParams: [card.customerName, card.serviceName, when, business.name],
      });
      report.sent++;
    } catch (error) {
      await store.releaseReminder(appointment.id);
      report.failed.push({ id: appointment.id, error: (error as Error).message.slice(0, 300) });
      continue;
    }

    // Müşteri hatırlatmaya yanıt verirse ("iptal", "gelemeyeceğim") asistan bağlamı bilsin.
    const key = { businessId: business.id, channel: "whatsapp" as const, contact: to };
    const base = appUrl();
    const text = `Hatırlatma gönderildi: ${card.customerName}, yarın (${when}) ${card.serviceName} randevunuz var.${
      base ? ` ${base}/randevu/${appointment.id}` : ""
    }`;
    await store.withConversationLock(key, async () => {
      const conversation = await store.findOrCreateConversation({ ...key, contactName: appointment.customerName });
      conversation.transcript.push({ from: "assistant", text, at: new Date().toISOString() });
      conversation.history.push({ role: "assistant", content: `[Otomatik hatırlatma] ${text}` });
      await store.saveConversation(conversation);
    });
  }
  return report;
}
