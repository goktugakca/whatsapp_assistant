"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { freeSlots, SINGLE_RESOURCE } from "@/lib/availability";
import { loadBusiness, phoneNumberIdFor } from "@/lib/business";
import { validateBusiness } from "@/lib/business-schema";
import { assertBusinessAccess } from "@/lib/dal";
import { normalizePhone } from "@/lib/phone";
import { extractServicesFromImages, IMAGE_TYPES, MAX_IMAGES, type ImageType } from "@/lib/price-list-import";
import type { ExtractedService } from "@/lib/service-merge";
import { getStore, type Conversation, type Store } from "@/lib/store";
import { openToken, sendInstagramReply } from "@/lib/instagram";
import { sendText } from "@/lib/whatsapp";

// Konuşmayı kilit altında güncel haliyle okuyup değiştirir; aynı anda çalışan bir asistan
// turunun değişikliklerini ezmez.
async function updateConversation(store: Store, id: string, change: (c: Conversation) => Promise<void>) {
  const current = await store.getConversation(id);
  if (!current) return;
  await assertBusinessAccess(current.businessId);
  await store.withConversationLock(current, async () => {
    const conversation = await store.getConversation(id);
    if (!conversation) return;
    await change(conversation);
    await store.saveConversation(conversation);
  });
}

export async function resumeAssistant(formData: FormData) {
  const id = z.string().parse(formData.get("conversationId"));
  const store = await getStore();
  await updateConversation(store, id, async (conversation) => {
    conversation.status = "bot";
    conversation.handoffReason = undefined;
  });
  revalidatePath("/panel");
}

// Panelden engelleme: asistan bu müşteriye artık yanıt vermez; mesajları panelde görünmeye devam eder.
export async function blockConversation(formData: FormData) {
  const id = z.string().parse(formData.get("conversationId"));
  const store = await getStore();
  await updateConversation(store, id, async (conversation) => {
    conversation.status = "blocked";
    conversation.handoffReason = "Panelden engellendi";
  });
  revalidatePath("/panel");
}

export async function sendStaffReply(formData: FormData) {
  const id = z.string().parse(formData.get("conversationId"));
  const text = z.string().trim().min(1).max(4000).parse(formData.get("text"));
  const store = await getStore();
  await updateConversation(store, id, async (conversation) => {
    if (conversation.channel === "whatsapp") {
      const business = await loadBusiness(store, conversation.businessId);
      const phoneNumberId = business && phoneNumberIdFor(business);
      if (!phoneNumberId) throw new Error("İşletmenin WhatsApp numarası tanımlı değil");
      await sendText({ phoneNumberId, to: conversation.contact, text });
    } else if (conversation.channel === "instagram") {
      const account = await store.getInstagramAccount(conversation.businessId);
      if (!account) throw new Error("İşletmenin Instagram hesabı bağlı değil");
      await sendInstagramReply({ token: openToken(account.sealedToken), to: conversation.contact, text });
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
  const store = await getStore();
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(String(formData.get("payload")));
  } catch {
    return { ok: false, message: "Form okunamadı." };
  }
  await assertBusinessAccess(String(input.id ?? ""));
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

export type PriceListImportResult =
  | { ok: true; services: ExtractedService[]; notes: string }
  | { ok: false; message: string };

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function safeJson(value: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    return undefined;
  }
}

// Fiyat listesi fotoğraflarından hizmetleri çıkarır. Hiçbir şey kaydetmez: sonuç ayarlar
// formuna eklenir, işletme sahibi kontrol edip kaydeder.
export async function importPriceList(businessId: string, formData: FormData): Promise<PriceListImportResult> {
  await assertBusinessAccess(businessId);
  const business = await loadBusiness(await getStore(), businessId);
  if (!business) return { ok: false, message: "İşletme bulunamadı." };

  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, message: "Fotoğraf seçilmedi." };
  if (files.length > MAX_IMAGES) return { ok: false, message: `En fazla ${MAX_IMAGES} fotoğraf yükleyebilirsiniz.` };
  const images = [];
  for (const file of files) {
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
      return { ok: false, message: "Sadece JPG, PNG veya WEBP fotoğraf yükleyebilirsiniz." };
    }
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, message: "Fotoğraflardan biri çok büyük." };
    images.push({ mediaType: file.type as ImageType, data: Buffer.from(await file.arrayBuffer()).toString("base64") });
  }

  try {
    // Formdaki güncel (henüz kaydedilmemiş olabilir) hizmet adları; aynı hizmeti farklı adla
    // tekrar açmamak için modele verilir.
    const existing = z.array(z.string().max(80)).max(100).catch([]).parse(safeJson(formData.get("existing")));
    const result = await extractServicesFromImages({ businessType: business.type, images, existingServiceNames: existing });
    if (result.services.length === 0) {
      return { ok: false, message: result.notes || "Fotoğrafta hizmet ve fiyat bulunamadı." };
    }
    return { ok: true, services: result.services, notes: result.notes };
  } catch (error) {
    console.error("Fiyat listesi okunamadı:", error);
    return { ok: false, message: "Fotoğraf şu an okunamadı, biraz sonra tekrar deneyin." };
  }
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
  const values = Object.fromEntries([...formData].map(([k, v]) => [k, String(v)]));
  await assertBusinessAccess(values.businessId ?? "");
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
    busy: (
      await store.listAppointments(business.id, {
        from: `${input.date}T00:00:00${business.utcOffset}`,
        to: `${input.date}T23:59:59${business.utcOffset}`,
      })
    ).map((a) => ({ start: a.start, end: a.end, staffId: a.staffId })),
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
  const businessId = z.string().parse(formData.get("businessId"));
  await assertBusinessAccess(businessId);
  const appointmentId = z.string().parse(formData.get("appointmentId"));
  await (await getStore()).cancelAppointment(businessId, appointmentId);
  revalidatePath("/panel", "layout");
  // Takvim sayfası "iptal edildi" mesajıyla aynı haftaya döner (sadece panel içi adres).
  const back = String(formData.get("back") ?? "");
  if (back.startsWith("/panel/")) redirect(back);
}

// Instagram bağlantısını kaldırır: anahtar silinir, mesajlar artık işlenmez. Geçmiş konuşmalar kalır.
export async function disconnectInstagram(formData: FormData) {
  const businessId = z.string().parse(formData.get("businessId"));
  await assertBusinessAccess(businessId);
  await (await getStore()).deleteInstagramAccount(businessId);
  revalidatePath("/panel/ayarlar");
}
