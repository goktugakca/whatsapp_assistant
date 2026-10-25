"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { loadBusiness, phoneNumberIdFor } from "@/lib/business";
import { validateBusiness } from "@/lib/business-schema";
import { isPanelAuthorized } from "@/lib/panel-auth";
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
