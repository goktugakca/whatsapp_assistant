"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { freeSlots, SINGLE_RESOURCE } from "@/lib/availability";
import { loadBusiness, phoneNumberIdFor } from "@/lib/business";
import { validateBusiness } from "@/lib/business-schema";
import { isPanelAuthorized } from "@/lib/panel-auth";
import { normalizePhone } from "@/lib/phone";
import { getStore, type Conversation, type Store } from "@/lib/store";
import { sendText } from "@/lib/whatsapp";

async function requirePanelAuth() {
  if (!isPanelAuthorized((await headers()).get("authorization"))) throw new Error("Yetkisiz");
}

// Konuşmayı kilit altında güncel haliyle okuyup değiştirir; aynı anda çalışan bir asistan
// turunun değişikliklerini ezmez.
async function updateConversation(store: Store, id: string, change: (c: Conversation) => Promise<void>) {
  const current = await store.getConversation(id);
  if (!current) return;
  await store.withConversationLock(current, async () => {
    const conversation = await store.getConversation(id);
    if (!conversation) return;
    await change(conversation);
    await store.saveConversation(conversation);
  });
}

export async function resumeAssistant(formData: FormData) {
  await requirePanelAuth();
  const id = z.string().parse(formData.get("conversationId"));
  const store = await getStore();
  await updateConversation(store, id, async (conversation) => {
    conversation.status = "bot";
    conversation.handoffReason = undefined;
  });
  revalidatePath("/panel");
}

export async function sendStaffReply(formData: FormData) {
  await requirePanelAuth();
  const id = z.string().parse(formData.get("conversationId"));
  const text = z.string().trim().min(1).max(4000).parse(formData.get("text"));
  const store = await getStore();
  await updateConversation(store, id, async (conversation) => {
    if (conversation.channel === "whatsapp") {
      const business = await loadBusiness(store, conversation.businessId);
      const phoneNumberId = business && phoneNumberIdFor(business);
      if (!phoneNumberId) throw new Error("İşletmenin WhatsApp numarası tanımlı değil");
      await sendText({ phoneNumberId, to: conversation.contact, text });
    }
    conversation.transcript.push({ from: "staff", text, at: new Date().toISOString() });
    // Asistan yeniden açıldığında personelin ne dediğini bilsin.
    conversation.history.push({ role: "assistant", content: `[İşletme personeli yazdı] ${text}` });
  });
  revalidatePath("/panel");
}

export type SettingsState = { ok: boolean; message: string; errors?: string[] } | null;

// Ayarlar sayfasının tamamı tek seferde, JSON olarak kaydedilir. Kimlik, tür, saat dilimi ve
// WhatsApp numarası panelden değiştirilemez; mevcut kayıttan alınır.
export async function saveBusinessSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requirePanelAuth();
  const store = await getStore();
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(String(formData.get("payload")));
  } catch {
    return { ok: false, message: "Form okunamadı." };
  }
  const current = await loadBusiness(store, String(input.id ?? ""));
  if (!current) return { ok: false, message: "İşletme bulunamadı." };

  const result = validateBusiness({
    ...input,
    id: current.id,
    type: current.type,
    utcOffset: current.utcOffset,
    whatsappPhoneNumberId: current.whatsappPhoneNumberId,
  });
  if (!result.ok) return { ok: false, message: "Kaydedilemedi, şunları düzeltin:", errors: result.errors };

  await store.saveBusinessSettings(result.business);
  revalidatePath("/panel", "layout");
  revalidatePath("/demo");
  return { ok: true, message: "Kaydedildi. Asistan bir sonraki mesajdan itibaren yeni bilgileri kullanır." };
}

export type ManualAppointmentState = {
  ok: boolean;
  message: string;
  suggestions?: string[];
  // Hata durumunda form sıfırlanınca girilen değerler kaybolmasın.
  values?: Record<string, string>;
} | null;

const manualAppointmentInput = z.object({
  businessId: z.string(),
  customerName: z.string().trim().min(2, "Müşteri adı gerekli").max(80),
  contact: z.string().trim().max(30).optional(),
  serviceId: z.string(),
  staffId: z.string(), // "any" = fark etmez
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih seçin"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Saat seçin"),
});

// Telefonla veya yüz yüze alınan randevuyu panelden ekler. Asistanla aynı kurallar geçerli:
// sadece işletmenin ve çalışanın boş olduğu saate yazılır.
export async function addManualAppointment(
  _prev: ManualAppointmentState,
  formData: FormData,
): Promise<ManualAppointmentState> {
  await requirePanelAuth();
  const values = Object.fromEntries([...formData].map(([k, v]) => [k, String(v)]));
  const fail = (message: string, suggestions?: string[]) => ({ ok: false, message, suggestions, values });
  const parsed = manualAppointmentInput.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const input = parsed.data;

  const store = await getStore();
  const business = await loadBusiness(store, input.businessId);
  const service = business?.services.find((s) => s.id === input.serviceId);
  if (!business || !service) return fail("İşletme veya hizmet bulunamadı.");

  const start = `${input.date}T${input.time}:00${business.utcOffset}`;
  const staffFilter = input.staffId === "any" ? undefined : input.staffId;
  const slots = freeSlots({
    business,
    date: input.date,
    serviceId: service.id,
    staffId: staffFilter,
    busy: (await store.listAppointments(business.id)).map((a) => ({ start: a.start, end: a.end, staffId: a.staffId })),
  });
  const slot = slots.find((s) => s.start === start);
  if (!slot) {
    const timeOf = (iso: string) => iso.slice(11, 16);
    return fail(
      slots.length
        ? "Bu saat uygun değil. O gün boş saatler:"
        : "Bu gün için boş saat yok (kapalı gün, geçmiş saat veya tamamen dolu).",
      slots.slice(0, 12).map((s) => timeOf(s.start)),
    );
  }

  const end = new Date(Date.parse(start) + service.durationMinutes * 60_000).toISOString();
  for (const staffId of slot.staffIds) {
    const appointment = await store.addAppointmentIfFree({
      businessId: business.id,
      source: "panel",
      customerName: input.customerName,
      // WhatsApp'tan gelen numarayla aynı biçim: hatırlatma gönderilebilsin, müşteri
      // WhatsApp'tan yazınca kendi randevusunu görebilsin.
      contact: (input.contact && normalizePhone(input.contact)) || input.contact || "—",
      serviceId: service.id,
      staffId: staffId === SINGLE_RESOURCE ? undefined : staffId,
      start,
      end,
    });
    if (appointment) {
      revalidatePath("/panel", "layout");
      const who = business.staff.find((s) => s.id === appointment.staffId)?.name;
      return { ok: true, message: `Randevu eklendi${who ? ` (${who})` : ""}.` };
    }
  }
  return fail("Bu saat az önce doldu, başka bir saat seçin.");
}

export async function cancelAppointmentAction(formData: FormData) {
  await requirePanelAuth();
  const businessId = z.string().parse(formData.get("businessId"));
  const appointmentId = z.string().parse(formData.get("appointmentId"));
  await (await getStore()).cancelAppointment(businessId, appointmentId);
  revalidatePath("/panel", "layout");
}
